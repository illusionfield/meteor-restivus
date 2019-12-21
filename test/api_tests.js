Meteor.startup(function () {
  const Api = new Restivus({
    useDefaultAuth: true,
    auth: {
      token: 'apiKey',
    },
    defaultHeaders: {
      'Content-Type' : 'text/json',
      'X-Test-Header': 'test header',
    },
    defaultOptionsEndpoint() {
      return {
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'options',
      };
    },
  });

  Api.addRoute('default-endpoints', {
    get() {
      return 'get';
    },
  });

  Api.addRoute('default-headers', {
    get() {
      return true;
    },
  });
  Api.addRoute('override-default-headers', {
    get() {
      return {
        headers: {
          'Content-Type'               : 'application/json',
          'Access-Control-Allow-Origin': 'https://mywebsite.com',
        },
        body: true,
      };
    },
  });
  Api.addRoute('mult-query-params', {
    get() {
      test.equal(this.queryParams.key1, '1234');
      test.equal(this.queryParams.key2, 'abcd');
      test.equal(this.queryParams.key3, 'a1b2');
      return true;
    },
  });
  Api.addRoute('null-response', {
    get() {
      return null;
    },
  });
  Api.addRoute('undefined-response', {
    get() {
      return void 0;
    },
  });
  Api.addRoute('manual-response', {
    get() {
      this.response.write('Testing manual response.');
      this.response.end();
      this.done();
    },
  });
  Api.addRoute('manual-response-no-end', {
    get() {
      this.response.write('Testing this.end()');
      this.done();
    },
  });
  Api.addRoute('chunked-response', {
    get() {
      this.response.write('Testing ');
      this.response.write('chunked response.');
      this.done();
    },
  });
  Api.addRoute('plain-text-response', {
    get() {
      return {
        headers: {
          'Content-Type': 'text/plain',
        },
        body   : 'foo"bar',
      };
    },
  });
  Api.addCollection(new Mongo.Collection('excluded-endpoints'), {
    excludedEndpoints: ['get', 'getAll'],
  });
  Api.addCollection(new Mongo.Collection('method-not-implemented'), {
    excludedEndpoints: ['get', 'getAll'],
  });

  describe('An API', function () {
    it('should allow the default configuration to be overridden', function (test, waitFor) {
      var config;
      config = Api._config;
      test.equal(config.useDefaultAuth, true);
      test.equal(config.auth.token, 'apiKey');
      test.equal(config.defaultHeaders['Content-Type'], 'text/json');
      test.equal(config.defaultHeaders['X-Test-Header'], 'test header');
      test.equal(config.defaultHeaders['Access-Control-Allow-Origin'], '*');
    });
    it('should append its version to the base URL path', function (test, waitFor) {
      var AppendVersion, AppendVersion2, config;
      AppendVersion = new Restivus({
        version: 'v1',
      });
      config = AppendVersion._config;
      test.equal(config.apiPath, 'api/v1/');
      // Test with custom base path
      AppendVersion2 = new Restivus({
        apiPath: 'test',
        version: 'v1',
      });
      config = AppendVersion2._config;
      return test.equal(config.apiPath, 'test/v1/');
    });
    it('should support multiple versions of the same endpoint', function (test, waitFor) {
      var ApiV1, ApiV2;
      ApiV1 = new Restivus({
        version: 'v1',
      });
      ApiV1.addRoute('multiple-versions', {
        get() {
          return 'get something';
        },
      });
      ApiV2 = new Restivus({
        version: 'v2',
      });
      ApiV2.addRoute('multiple-versions', {
        get() {
          return {
            status: 'success',
            data  : 'get something different',
          };
        },
      });
      HTTP.get(Meteor.absoluteUrl('api/v1/multiple-versions'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.equal(result.statusCode, 200);
        test.equal(response, 'get something');
      }));
      HTTP.get(Meteor.absoluteUrl('api/v2/multiple-versions'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.equal(result.statusCode, 200);
        test.equal(response.status, 'success');
        test.equal(response.data, 'get something different');
      }));
    });
  });

  describe('An API route', function () {
    it('should use the default OPTIONS endpoint if none is defined for the requested method', function (test, waitFor) {
      HTTP.call('OPTIONS', Meteor.absoluteUrl('api/default-endpoints'), waitFor(function (error, result) {
        var response;
        response = result.content;
        test.equal(result.statusCode, 200);
        test.equal(response, 'options');
      }));
    });
  });

  describe('An API collection route', function () {
    it('should be able to exclude endpoints using just the excludedEndpoints option', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/excluded-endpoints/10'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.isTrue(error);
        test.equal(result.statusCode, 405);
        test.equal(response.status, 'error');
        return test.equal(response.message, 'API endpoint does not exist');
      }));
      HTTP.get(Meteor.absoluteUrl('api/excluded-endpoints/'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.isTrue(error);
        test.equal(result.statusCode, 405);
        test.equal(response.status, 'error');
        return test.equal(response.message, 'API endpoint does not exist');
      }));
      // Make sure it doesn't exclude any endpoints it shouldn't
      return HTTP.post(Meteor.absoluteUrl('api/excluded-endpoints/'), {
        data: {
          test: 'abc',
        },
      }, waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.equal(result.statusCode, 201);
        test.equal(response.status, 'success');
        return test.equal(response.data.test, 'abc');
      }));
    });

    describe('with the default autogenerated endpoints', function () {
      var testId;
      Api.addCollection(new Mongo.Collection('autogen'));
      testId = null;
      it('should support a POST on api/collection', function (test, waitFor) {
        var response, responseData, result;
        result = HTTP.post(Meteor.absoluteUrl('api/autogen'), {
          data: {
            name       : 'test name',
            description: 'test description',
          },
        });
        response = JSON.parse(result.content);
        responseData = response.data;
        test.equal(result.statusCode, 201);
        test.equal(response.status, 'success');
        test.equal(responseData.name, 'test name');
        test.equal(responseData.description, 'test description');
        // Persist the new resource id
        testId = responseData._id;
      });
      it('should not support a DELETE on api/collection', function (test, waitFor) {
        HTTP.del(Meteor.absoluteUrl('api/autogen'), waitFor(function (error, result) {
          var response;
          response = JSON.parse(result.content);
          test.isTrue(error);
          test.equal(result.statusCode, 405);
          test.isTrue(result.headers['allow'].indexOf('POST') !== -1);
          test.isTrue(result.headers['allow'].indexOf('GET') !== -1);
          test.equal(response.status, 'error');
          test.equal(response.message, 'API endpoint does not exist');
        }));
      });
      it('should support a PUT on api/collection/:id', function (test, waitFor) {
        var response, responseData, result;
        result = HTTP.put(Meteor.absoluteUrl(`api/autogen/${testId}`), {
          data: {
            name       : 'update name',
            description: 'update description',
          },
        });
        response = JSON.parse(result.content);
        responseData = response.data;
        test.equal(result.statusCode, 200);
        test.equal(response.status, 'success');
        test.equal(responseData.name, 'update name');
        test.equal(responseData.description, 'update description');
        result = HTTP.put(Meteor.absoluteUrl(`api/autogen/${testId}`), {
          data: {
            name: 'update name with no description',
          },
        });
        response = JSON.parse(result.content);
        responseData = response.data;
        test.equal(result.statusCode, 200);
        test.equal(response.status, 'success');
        test.equal(responseData.name, 'update name with no description');
        return test.isUndefined(responseData.description);
      });
      it('should support a PATCH on api/collection/:id', function (test, waitFor) {
        var response, responseData, result;
        result = HTTP.patch(Meteor.absoluteUrl(`api/autogen/${testId}`), {
          data: {
            name       : 'new name',
            description: 'new description',
          },
        });
        response = JSON.parse(result.content);
        responseData = response.data;
        test.equal(result.statusCode, 200);
        test.equal(response.status, 'success');
        test.equal(responseData.name, 'new name');
        test.equal(responseData.description, 'new description');
        result = HTTP.patch(Meteor.absoluteUrl(`api/autogen/${testId}`), {
          data: {
            name: 'new name with no description',
          },
        });
        response = JSON.parse(result.content);
        responseData = response.data;
        test.equal(result.statusCode, 200);
        test.equal(response.status, 'success');
        test.equal(responseData.name, 'new name with no description');
        return test.equal(responseData.description, 'new description');
      });
    });
  });

  describe('An API endpoint', function () {
    it('should respond with the default headers when not overridden', function (test, waitFor) {
      var result;
      result = HTTP.get(Meteor.absoluteUrl('api/default-headers'));
      test.equal(result.statusCode, 200);
      test.equal(result.headers['content-type'], 'text/json');
      test.equal(result.headers['x-test-header'], 'test header');
      test.equal(result.headers['access-control-allow-origin'], '*');
      test.isTrue(result.content);
    });
    it('should allow default headers to be overridden', function (test, waitFor) {
      var result;
      result = HTTP.get(Meteor.absoluteUrl('api/override-default-headers'));
      test.equal(result.statusCode, 200);
      test.equal(result.headers['content-type'], 'application/json');
      test.equal(result.headers['access-control-allow-origin'], 'https://mywebsite.com');
      test.isTrue(result.content);
    });
    it('should have access to multiple query params', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/mult-query-params?key1=1234&key2=abcd&key3=a1b2'), waitFor(function (error, result) {
        test.isTrue(result);
      }));
    });
    it('should return a 405 error if that method is not implemented on the route', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/method-not-implemented/'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.isTrue(error);
        test.equal(result.statusCode, 405);
        test.equal(response.status, 'error');
        test.equal(response.message, 'API endpoint does not exist');
      }));
      HTTP.get(Meteor.absoluteUrl('api/method-not-implemented/10'), waitFor(function (error, result) {
        var response;
        response = JSON.parse(result.content);
        test.isTrue(error);
        test.equal(result.statusCode, 405);
        test.isTrue(result.headers['allow'].indexOf('PUT') !== -1);
        test.isTrue(result.headers['allow'].indexOf('DELETE') !== -1);
        test.equal(response.status, 'error');
        test.equal(response.message, 'API endpoint does not exist');
      }));
    });
    it('should cause an error when it returns null', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/null-response'), waitFor(function (error, result) {
        test.isTrue(error);
        test.equal(result.statusCode, 500);
      }));
    });
    it('should cause an error when it returns undefined', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/undefined-response'), waitFor(function (error, result) {
        test.isTrue(error);
        test.equal(result.statusCode, 500);
      }));
    });
    it('should be able to handle it\'s response manually', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/manual-response'), waitFor(function (error, result) {
        var response;
        response = result.content;
        test.equal(result.statusCode, 200);
        test.equal(response, 'Testing manual response.');
      }));
    });
    it('should not have to call this.response.end() when handling the response manually', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/manual-response-no-end'), waitFor(function (error, result) {
        var response;
        response = result.content;
        test.isFalse(error);
        test.equal(result.statusCode, 200);
        test.equal(response, 'Testing this.end()');
      }));
    });
    it('should be able to send it\'s response in chunks', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/chunked-response'), waitFor(function (error, result) {
        var response;
        response = result.content;
        test.equal(result.statusCode, 200);
        test.equal(response, 'Testing chunked response.');
      }));
    });
    it('should not wrap text with quotes when response Content-Type is text/plain', function (test, waitFor) {
      HTTP.get(Meteor.absoluteUrl('api/plain-text-response'), waitFor(function (error, result) {
        var response;
        response = result.content;
        test.equal(result.statusCode, 200);
        test.equal(response, 'foo"bar');
      }));
    });
    it('should have its context set', function (test, waitFor) {
      const ContextApi = new Restivus;

      ContextApi.addRoute('context/:test', {
        post() {
          test.equal(this.urlParams.test, '100');
          test.equal(this.queryParams.test, 'query');
          test.equal(this.bodyParams.test, 'body');
          test.isNotNull(this.request);
          test.isNotNull(this.response);
          test.isTrue(_.isFunction(this.done));
          test.isFalse(this.authRequired);
          test.isFalse(this.roleRequired);
          return true;
        },
      });

      const result = HTTP.post(Meteor.absoluteUrl('api/context/100?test=query'), {
        data: {
          test: 'body',
        },
      });

      test.equal(result.statusCode, 200);
      test.isTrue(result.content);
    });
  });
});
