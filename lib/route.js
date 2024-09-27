import path from 'path';
import Fiber from 'fibers';
import Future from 'fibers/future';
import { Meteor } from 'meteor/meteor';

export class Route {
  constructor(api, path1, options, endpoints1) {
    this.api = api;
    this.path = path1;
    this.options = options;
    this.endpoints = endpoints1;
    // Check if options were provided
    if (!this.endpoints) {
      this.endpoints = this.options;
      this.options = {};
    }
  }

  /*
    Convert all endpoints on the given route into our expected endpoint object if it is a bare
    function

    @param {Route} route The route the endpoints belong to
  */
  _resolveEndpoints() {
    _.each(this.endpoints, function (endpoint, method, endpoints) {
      if (_.isFunction(endpoint)) {
        return endpoints[method] = {
          action: endpoint,
        };
      }
    });
  }

  /*
  Configure the authentication and role requirement on all endpoints (except OPTIONS, which must
  be configured directly on the endpoint)

  Authentication can be required on an entire route or individual endpoints. If required on an
  entire route, that serves as the default. If required in any individual endpoints, that will
  override the default.

  After the endpoint is configured, all authentication and role requirements of an endpoint can be
  accessed at <code>endpoint.authRequired</code> and <code>endpoint.roleRequired</code>,
  respectively.

  @param {Route} route The route the endpoints belong to
  @param {Endpoint} endpoint The endpoint to configure
  */
  _configureEndpoints() {
    _.each(this.endpoints, function (endpoint, method) {
      var ref, ref1;
      if (method !== 'options') {
        // Configure acceptable roles
        if (!((ref = this.options) != null ? ref.roleRequired : void 0)) {
          this.options.roleRequired = [];
        }
        if (!endpoint.roleRequired) {
          endpoint.roleRequired = [];
        }
        endpoint.roleRequired = _.union(endpoint.roleRequired, this.options.roleRequired);
        // Make it easier to check if no roles are required
        if (_.isEmpty(endpoint.roleRequired)) {
          endpoint.roleRequired = false;
        }
        // Configure auth requirement
        if (endpoint.authRequired === void 0) {
          if (((ref1 = this.options) != null ? ref1.authRequired : void 0) || endpoint.roleRequired) {
            endpoint.authRequired = true;
          } else {
            endpoint.authRequired = false;
          }
        }
      }
    }, this);
  }

  /*
  Authenticate an endpoint if required, and return the result of calling it

  @returns The endpoint response or a 401 if authentication fails
  */
  _callEndpoint(endpointContext, endpoint) {
    //let cb;

    // Call the endpoint if authentication doesn't fail
    const auth = this._authAccepted(endpointContext, endpoint);
    const future = new Future;
    const methodInvocation = new DDPCommon.MethodInvocation({
      isSimulation: false,
      userId: endpointContext.userId
    });

    function callMethod(methodName, ...args) {
      if(args.length && 'function' === typeof args[args.length-1]) {
        cb = args.pop();
      }

      DDP._CurrentInvocation.withValue(methodInvocation, () => {
        Meteor.call(methodName, ...args, (err, resp) => {
          if(err)
            return future.throw(err);
          future.return(resp);
        });
      });

      //const ret = cb(err, resp);
      return future.wait();
    }

    if (auth.success) {
      if (this._roleAccepted(endpointContext, endpoint)) {
        _.extend(endpointContext, {call: callMethod});
        return endpoint.action.call(endpointContext);
      } else {
        return {
          statusCode: 403,
          body      : {
            status : 'error',
            message: 'You do not have permission to do this.', // Auth failed
          },
        };
      }
    } else {
      if (auth.data) {
        return auth.data;
      } else {
        return {
          statusCode: 401,
          body      : {
            status : 'error',
            message: 'You must be logged in to do this.',
          },
        };
      }
    }
  }

  /*
    Authenticate the given endpoint if required

    Once it's globally configured in the API, authentication can be required on an entire route or
    individual endpoints. If required on an entire endpoint, that serves as the default. If required
    in any individual endpoints, that will override the default.

    @returns An object of the following format:

  {
    success: Boolean
    data: String or Object
  }

  where `success` is `true` if all required authentication checks pass and the optional `data`
  will contain the auth data when successful and an optional error response when auth fails.
  */
  _authAccepted(endpointContext, endpoint) {
    if (endpoint.authRequired) {
      return this._authenticate(endpointContext);
    } else {
      return {
        success: true,
      };
    }
  }

  /*
  Verify the request is being made by an actively logged in user

  If verified, attach the authenticated user to the context.

  @returns An object of the following format:

    {
    success: Boolean
    data: String or Object
    }

  where `success` is `true` if all required authentication checks pass and the optional `data`
  will contain the auth data when successful and an optional error response when auth fails.
  */
  _authenticate(endpointContext) {
    var auth, userSelector;
    // Get auth info
    auth = this.api._config.auth.user.call(endpointContext);
    if(!auth) {
      return {success: false};
    }
    // Get the user from the database
    if (auth.userId && auth.token && !auth.user) {
      userSelector = {};
      userSelector._id = auth.userId;
      userSelector[this.api._config.auth.token] = auth.token;
      auth.user = Meteor.users.findOne(userSelector);
    }
    if (auth.error) {
      return {
        success: false,
        data   : auth.error,
      };
    }
    // Attach the user and their ID to the context if the authentication was successful
    if (auth.user) {
      endpointContext.user = auth.user;
      endpointContext.userId = auth.user._id;
      return {
        success: true,
        data   : auth,
      };
    } else {
      return {
        success: false,
      };
    }
  }

  /*
  Authenticate the user role if required

  Must be called after _authAccepted().

  @returns True if the authenticated user belongs to <i>any</i> of the acceptable roles on the
       endpoint
  */
  _roleAccepted(endpointContext, endpoint) {
    if (endpoint.roleRequired) {
      if (_.isEmpty(_.intersection(endpoint.roleRequired, endpointContext.user.roles))) {
        return false;
      }
    }
    return true;
  }

  /*
  Respond to an HTTP request
  */
  _respond(response, body, statusCode = 200, headers = {}) {
    var defaultHeaders, delayInMilliseconds, minimumDelayInMilliseconds, randomMultiplierBetweenOneAndTwo,
      sendResponse;
    // Override any default headers that have been provided (keys are normalized to be case insensitive)
    // TODO: Consider only lowercasing the header keys we need normalized, like Content-Type
    defaultHeaders = this._lowerCaseKeys(this.api._config.defaultHeaders);
    headers = this._lowerCaseKeys(headers);
    headers = _.extend(defaultHeaders, headers);
    // Prepare JSON body for response when Content-Type indicates JSON type
    if (headers['content-type'].match(/json|javascript/) !== null) {
      if (this.api._config.prettyJson) {
        body = JSON.stringify(body, void 0, 2);
      } else {
        body = JSON.stringify(body);
      }
    }
    // Send response
    sendResponse = function () {
      response.writeHead(statusCode, headers);
      response.write(body);
      return response.end();
    };
    if (statusCode === 401 || statusCode === 403) {
      // Hackers can measure the response time to determine things like whether the 401 response was
      // caused by bad user id vs bad password.
      // In doing so, they can first scan for valid user ids regardless of valid passwords.
      // Delay by a random amount to reduce the ability for a hacker to determine the response time.
      // See https://www.owasp.org/index.php/Blocking_Brute_Force_Attacks#Finding_Other_Countermeasures
      // See https://en.wikipedia.org/wiki/Timing_attack
      minimumDelayInMilliseconds = 500;
      randomMultiplierBetweenOneAndTwo = 1 + Math.random();
      delayInMilliseconds = minimumDelayInMilliseconds * randomMultiplierBetweenOneAndTwo;
      return Meteor.setTimeout(sendResponse, delayInMilliseconds);
    } else {
      return sendResponse();
    }
  }

  /*
    Return the object with all of the keys converted to lowercase
  */
  _lowerCaseKeys(object) {
    return _.chain(object).pairs().map(function (attr) {
      return [attr[0].toLowerCase(), attr[1]];
    }).object().value();
  }
  addToApi() {
    const availableMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'];

    const self = this;
    // Throw an error if a route has already been added at this path
    // TODO: Check for collisions with paths that follow same pattern with different parameter names
    if (_.contains(this.api._config.paths, this.path)) {
      throw new Error(`Cannot add a route at an existing path: ${this.path}`);
    }
    // Override the default OPTIONS endpoint with our own
    this.endpoints = _.extend({
      options: this.api._config.defaultOptionsEndpoint,
    }, this.endpoints);
    // Configure each endpoint on this route
    this._resolveEndpoints();
    this._configureEndpoints();
    // Add to our list of existing paths
    this.api._config.paths.push(this.path);
    const allowedMethods = _.filter(availableMethods, function (method) {
      return _.contains(_.keys(self.endpoints), method);
    });
    const rejectedMethods = _.reject(availableMethods, function (method) {
      return _.contains(_.keys(self.endpoints), method);
    });

    // Setup endpoints on route
    const fullPath = this.api._config.apiPath + this.path;
    _.each(allowedMethods, function (method) {
      const endpoint = self.endpoints[method];
      routeAdd(method, fullPath, function (req, res) {
        // Add function to endpoint context for indicating a response has been initiated manually
        let responseInitiated = false;
        const endpointContext = {
          urlParams: req.params,
          queryParams: req.query,
          bodyParams: req.body,
          request: req,
          response: res,
          done() {
            responseInitiated = true;
          },
        };
        // Add endpoint config options to context
        _.extend(endpointContext, endpoint);
        // Run the requested endpoint
        let responseData = null;
        try {
          responseData = self._callEndpoint(endpointContext, endpoint);
        } catch(error1) {
          if(!(error1 instanceof Meteor.Error)) {
            error1 = new Meteor.Error(500, `${(error1 || {}).message || error1 || 'Unknown error!'}`);
          }
          responseData = {
            statusCode: _.isNumber(error1.error) && error1.error > 0 ? error1.error : 500,
            body: {
              status: 'error',
              message: error1.reason || error1.message,
            },
          };
          // Do exactly what Iron Router would have done, to avoid changing the API
          //ironRouterSendErrorToResponse(error1, req, res);
          //return;
        }
        if(responseInitiated) {
          // Ensure the response is properly completed
          res.end();
          return;
        } else {
          if (res.headersSent) {
            throw new Error(`Must call this.done() after handling endpoint response manually: ${method} ${fullPath}`);
          } else if (responseData === null || responseData === void 0) {
            throw new Error(`Cannot return null or undefined from an endpoint: ${method} ${fullPath}`);
          }
        }
        // Generate and return the http response, handling the different endpoint response types
        if (responseData.body && (responseData.statusCode || responseData.headers)) {
          return self._respond(res, responseData.body, responseData.statusCode, responseData.headers);
        } else {
          return self._respond(res, responseData);
        }
      });
    });

    _.each(rejectedMethods, function (method) {
      routeAdd(method, fullPath, function (req, res) {
        const responseData = {
          status : 'error',
          message: 'API endpoint does not exist',
        };
        const headers = {
          Allow: allowedMethods.join(', ').toUpperCase(),
        };
        self._respond(res, responseData, 405, headers);
      });
    });
  }
}

// --------------------------------------------------------------------------------

import connectRoute from './connect-route.js';

// Save reference to router for later
var connectRouter;

// Register as a middleware
WebApp.connectHandlers.use(Meteor.bindEnvironment(connectRoute(router => {
  connectRouter = router;
})));

function routeAdd(method, uriPath, handler) {
  connectRouter[method.toLowerCase()](path.normalize('/'+uriPath), (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    Fiber(() => {
      try {
        handler(req, res, next);
      } catch (error) {
        next(error);
      }
    }).run();
  });
}

// --------------------------------------------------------------------------------

// Taken from: https://github.com/iron-meteor/iron-router/blob/9c369499c98af9fd12ef9e68338dee3b1b1276aa/lib/router_server.js#L47
function ironRouterSendErrorToResponse(err, req, res) {
  if(res.statusCode < 400) {
    res.statusCode = 500;
  }
  if(err.status) {
    res.statusCode = err.status;
  }

  const msg = process.env.NODE_ENV === 'development' ? (err.stack || err.toString()) + '\n' : 'Server error.';
  console.error(err.stack || err.toString());

  if(res.headersSent) {
    return req.socket.destroy();
  }

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Length', Buffer.byteLength(msg));
  if(req.method === 'HEAD') {
    return res.end();
  }
  res.end(msg);
  return;
}
