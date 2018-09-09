var Restivus,
    indexOf = [].indexOf;

this.Restivus = (function () {
    class Restivus {
        constructor(options) {
            var corsHeaders;
            this._routes = [];
            this._config = {
                paths         : [],
                useDefaultAuth: false,
                apiPath       : 'api/',
                version       : null,
                prettyJson    : false,
                auth          : {
                    token: 'services.resume.loginTokens.hashedToken',
                    user : function () {
                        var token;
                        if (this.request.headers['x-auth-token']) {
                            token = Accounts._hashLoginToken(this.request.headers['x-auth-token']);
                        }
                        return {
                            userId: this.request.headers['x-user-id'],
                            token : token,
                        };
                    },
                },
                defaultHeaders: {
                    'Content-Type': 'application/json',
                },
                enableCors    : true,
            };
            // Configure API with the given options
            _.extend(this._config, options);
            if (this._config.enableCors) {
                corsHeaders = {
                    'Access-Control-Allow-Origin' : '*',
                    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
                };
                if (this._config.useDefaultAuth) {
                    corsHeaders['Access-Control-Allow-Headers'] += ', X-User-Id, X-Auth-Token';
                }
                // Set default header to enable CORS if configured
                _.extend(this._config.defaultHeaders, corsHeaders);
                if (!this._config.defaultOptionsEndpoint) {
                    this._config.defaultOptionsEndpoint = function () {
                        this.response.writeHead(200, corsHeaders);
                        return this.done();
                    };
                }
            }
            // Normalize the API path
            if (this._config.apiPath[0] === '/') {
                this._config.apiPath = this._config.apiPath.slice(1);
            }
            if (_.last(this._config.apiPath) !== '/') {
                this._config.apiPath = this._config.apiPath + '/';
            }
            // URL path versioning is the only type of API versioning currently available, so if a version is
            // provided, append it to the base path of the API
            if (this._config.version) {
                this._config.apiPath += this._config.version + '/';
            }
            // Add default login and logout endpoints if auth is configured
            if (this._config.useDefaultAuth) {
                this._initAuth();
            } else if (this._config.useAuth) {
                this._initAuth();
                console.warn('Warning: useAuth API config option will be removed in Restivus v1.0 ' + '\n    Use the useDefaultAuth option instead');
            }
            return this;
        }

        /**
         Add endpoints for the given HTTP methods at the given path

         @param path {String} The extended URL path (will be appended to base path of the API)
         @param options {Object} Route configuration options
         @param options.authRequired {Boolean} The default auth requirement for each endpoint on the route
         @param options.roleRequired {String or String[]} The default role required for each endpoint on the route
         @param endpoints {Object} A set of endpoints available on the new route (get, post, put, patch, delete, options)
         @param endpoints.<method> {Function or Object} If a function is provided, all default route
         configuration options will be applied to the endpoint. Otherwise an object with an `action`
         and all other route config options available. An `action` must be provided with the object.
         */
        addRoute(path, options, endpoints) {
            var route;
            // Create a new route and add it to our list of existing routes
            route = new share.Route(this, path, options, endpoints);
            this._routes.push(route);
            route.addToApi();
            return this;
        }

        /**
         Generate routes for the Meteor Collection with the given name
         */
        addCollection(collection, options = {}) {
            var collectionEndpoints, collectionRouteEndpoints, endpointsAwaitingConfiguration, entityRouteEndpoints,
                excludedEndpoints, methods, methodsOnCollection, path, routeOptions;
            methods = ['get', 'post', 'put', 'patch', 'delete', 'getAll'];
            methodsOnCollection = ['post', 'getAll'];
            // Grab the set of endpoints
            if (collection === Meteor.users) {
                collectionEndpoints = this._userCollectionEndpoints;
            } else {
                collectionEndpoints = this._collectionEndpoints;
            }
            // Flatten the options and set defaults if necessary
            endpointsAwaitingConfiguration = options.endpoints || {};
            routeOptions = options.routeOptions || {};
            excludedEndpoints = options.excludedEndpoints || [];
            // Use collection name as default path
            path = options.path || collection._name;
            // Separate the requested endpoints by the route they belong to (one for operating on the entire
            // collection and one for operating on a single entity within the collection)
            collectionRouteEndpoints = {};
            entityRouteEndpoints = {};
            if (_.isEmpty(endpointsAwaitingConfiguration) && _.isEmpty(excludedEndpoints)) {
                // Generate all endpoints on this collection
                _.each(methods, function (method) {
                    // Partition the endpoints into their respective routes
                    if (indexOf.call(methodsOnCollection, method) >= 0) {
                        _.extend(collectionRouteEndpoints, collectionEndpoints[method].call(this, collection));
                    } else {
                        _.extend(entityRouteEndpoints, collectionEndpoints[method].call(this, collection));
                    }
                }, this);
            } else {
                // Generate any endpoints that haven't been explicitly excluded
                _.each(methods, function (method) {
                    var configuredEndpoint, endpointOptions;
                    if (indexOf.call(excludedEndpoints, method) < 0 && endpointsAwaitingConfiguration[method] !== false) {
                        // Configure endpoint and map to it's http method
                        // TODO: Consider predefining a map of methods to their http method type (e.g., getAll: get)
                        endpointOptions = endpointsAwaitingConfiguration[method];
                        configuredEndpoint = {};
                        _.each(collectionEndpoints[method].call(this, collection), function (action, methodType) {
                            return configuredEndpoint[methodType] = _.chain(action).clone().extend(endpointOptions).value();
                        });
                        // Partition the endpoints into their respective routes
                        if (indexOf.call(methodsOnCollection, method) >= 0) {
                            _.extend(collectionRouteEndpoints, configuredEndpoint);
                        } else {
                            _.extend(entityRouteEndpoints, configuredEndpoint);
                        }
                    }
                }, this);
            }
            // Add the routes to the API
            this.addRoute(path, routeOptions, collectionRouteEndpoints);
            this.addRoute(`${path}/:id`, routeOptions, entityRouteEndpoints);
            return this;
        }

        /*
          Add /login and /logout endpoints to the API
        */
        _initAuth() {
            var logout, self;
            self = this;
            /*
              Add a login endpoint to the API

              After the user is logged in, the onLoggedIn hook is called (see Restfully.configure() for
              adding hook).
            */
            this.addRoute('login', {
                authRequired: false,
            }, {
                post: function () {
                    var auth, e, extraData, password, ref, ref1, response, searchQuery, user;
                    // Grab the username or email that the user is logging in with
                    user = {};
                    if (this.bodyParams.user) {
                        if (this.bodyParams.user.indexOf('@') === -1) {
                            user.username = this.bodyParams.user;
                        } else {
                            user.email = this.bodyParams.user;
                        }
                    } else if (this.bodyParams.username) {
                        user.username = this.bodyParams.username;
                    } else if (this.bodyParams.email) {
                        user.email = this.bodyParams.email;
                    }
                    password = this.bodyParams.password;
                    if (this.bodyParams.hashed) {
                        password = {
                            digest   : password,
                            algorithm: 'sha-256',
                        };
                    }
                    try {
                        // Try to log the user into the user's account (if successful we'll get an auth token back)
                        auth = Auth.loginWithPassword(user, password);
                    } catch (error) {
                        e = error;
                        return ({} = {
                            statusCode: e.error,
                            body      : {
                                status : 'error',
                                message: e.reason,
                            },
                        });
                    }
                    // Get the authenticated user
                    // TODO: Consider returning the user in Auth.loginWithPassword(), instead of fetching it again here
                    if (auth.userId && auth.authToken) {
                        searchQuery = {};
                        searchQuery[self._config.auth.token] = Accounts._hashLoginToken(auth.authToken);
                        this.user = Meteor.users.findOne({
                            '_id': auth.userId,
                        }, searchQuery);
                        this.userId = (ref = this.user) != null ? ref._id : void 0;
                    }
                    response = {
                        status: 'success',
                        data  : auth,
                    };
                    // Call the login hook with the authenticated user attached
                    extraData = (ref1 = self._config.onLoggedIn) != null ? ref1.call(this) : void 0;
                    if (extraData != null) {
                        _.extend(response.data, {
                            extra: extraData,
                        });
                    }
                    return response;
                },
            });
            logout = function () {
                var authToken, extraData, hashedToken, index, ref, response, tokenFieldName, tokenLocation, tokenPath,
                    tokenRemovalQuery, tokenToRemove;
                // Remove the given auth token from the user's account
                authToken = this.request.headers['x-auth-token'];
                hashedToken = Accounts._hashLoginToken(authToken);
                tokenLocation = self._config.auth.token;
                index = tokenLocation.lastIndexOf('.');
                tokenPath = tokenLocation.substring(0, index);
                tokenFieldName = tokenLocation.substring(index + 1);
                tokenToRemove = {};
                tokenToRemove[tokenFieldName] = hashedToken;
                tokenRemovalQuery = {};
                tokenRemovalQuery[tokenPath] = tokenToRemove;
                Meteor.users.update(this.user._id, {
                    $pull: tokenRemovalQuery,
                });
                response = {
                    status: 'success',
                    data  : {
                        message: 'You\'ve been logged out!',
                    },
                };
                // Call the logout hook with the authenticated user attached
                extraData = (ref = self._config.onLoggedOut) != null ? ref.call(this) : void 0;
                if (extraData != null) {
                    _.extend(response.data, {
                        extra: extraData,
                    });
                }
                return response;
            };
            /*
            Add a logout endpoint to the API

            After the user is logged out, the onLoggedOut hook is called (see Restfully.configure() for
            adding hook).
            */
            return this.addRoute('logout', {
                authRequired: true,
            }, {
                get : function () {
                    console.warn("Warning: Default logout via GET will be removed in Restivus v1.0. Use POST instead.");
                    console.warn("    See https://github.com/kahmali/meteor-restivus/issues/100");
                    return logout.call(this);
                },
                post: logout,
            });
        }

    };

    /**
     A set of endpoints that can be applied to a Collection Route
     */
    Restivus.prototype._collectionEndpoints = {
        get   : function (collection) {
            return {
                get: {
                    action: function () {
                        var entity;
                        entity = collection.findOne(this.urlParams.id);
                        if (entity) {
                            return {
                                status: 'success',
                                data  : entity,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Item not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        put   : function (collection) {
            return {
                put: {
                    action: function () {
                        var entity, entityIsUpdated;
                        entityIsUpdated = collection.update(this.urlParams.id, this.bodyParams);
                        if (entityIsUpdated) {
                            entity = collection.findOne(this.urlParams.id);
                            return {
                                status: 'success',
                                data  : entity,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Item not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        patch : function (collection) {
            return {
                patch: {
                    action: function () {
                        var entity, entityIsUpdated;
                        entityIsUpdated = collection.update(this.urlParams.id, {
                            $set: this.bodyParams,
                        });
                        if (entityIsUpdated) {
                            entity = collection.findOne(this.urlParams.id);
                            return {
                                status: 'success',
                                data  : entity,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Item not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        delete: function (collection) {
            return {
                delete: {
                    action: function () {
                        if (collection.remove(this.urlParams.id)) {
                            return {
                                status: 'success',
                                data  : {
                                    message: 'Item removed',
                                },
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Item not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        post  : function (collection) {
            return {
                post: {
                    action: function () {
                        var entity, entityId;
                        entityId = collection.insert(this.bodyParams);
                        entity = collection.findOne(entityId);
                        if (entity) {
                            return {
                                statusCode: 201,
                                body      : {
                                    status: 'success',
                                    data  : entity,
                                },
                            };
                        } else {
                            return {
                                statusCode: 400,
                                body      : {
                                    status : 'fail',
                                    message: 'No item added',
                                },
                            };
                        }
                    },
                },
            };
        },
        getAll: function (collection) {
            return {
                get: {
                    action: function () {
                        var entities;
                        entities = collection.find().fetch();
                        if (entities) {
                            return {
                                status: 'success',
                                data  : entities,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Unable to retrieve items from collection',
                                },
                            };
                        }
                    },
                },
            };
        },
    };

    /**
     A set of endpoints that can be applied to a Meteor.users Collection Route
     */
    Restivus.prototype._userCollectionEndpoints = {
        get   : function (collection) {
            return {
                get: {
                    action: function () {
                        var entity;
                        entity = collection.findOne(this.urlParams.id, {
                            fields: {
                                profile: 1,
                            },
                        });
                        if (entity) {
                            return {
                                status: 'success',
                                data  : entity,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'User not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        put   : function (collection) {
            return {
                put: {
                    action: function () {
                        var entity, entityIsUpdated;
                        entityIsUpdated = collection.update(this.urlParams.id, {
                            $set: {
                                profile: this.bodyParams,
                            },
                        });
                        if (entityIsUpdated) {
                            entity = collection.findOne(this.urlParams.id, {
                                fields: {
                                    profile: 1,
                                },
                            });
                            return {
                                status: "success",
                                data  : entity,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'User not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        delete: function (collection) {
            return {
                delete: {
                    action: function () {
                        if (collection.remove(this.urlParams.id)) {
                            return {
                                status: 'success',
                                data  : {
                                    message: 'User removed',
                                },
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'User not found',
                                },
                            };
                        }
                    },
                },
            };
        },
        post  : function (collection) {
            return {
                post: {
                    action: function () {
                        var entity, entityId;
                        // Create a new user account
                        entityId = Accounts.createUser(this.bodyParams);
                        entity = collection.findOne(entityId, {
                            fields: {
                                profile: 1,
                            },
                        });
                        if (entity) {
                            return {
                                statusCode: 201,
                                body      : {
                                    status: 'success',
                                    data  : entity,
                                },
                            };
                        } else {
                            ({
                                statusCode: 400,
                            });
                            return {
                                status : 'fail',
                                message: 'No user added',
                            };
                        }
                    },
                },
            };
        },
        getAll: function (collection) {
            return {
                get: {
                    action: function () {
                        var entities;
                        entities = collection.find({}, {
                            fields: {
                                profile: 1,
                            },
                        }).fetch();
                        if (entities) {
                            return {
                                status: 'success',
                                data  : entities,
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body      : {
                                    status : 'fail',
                                    message: 'Unable to retrieve users',
                                },
                            };
                        }
                    },
                },
            };
        },
    };

    return Restivus;

}).call(this);

Restivus = this.Restivus;
