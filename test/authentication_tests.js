Meteor.startup(function () {
  const DefaultAuthApi = new Restivus({
    apiPath: 'default-auth',
    useDefaultAuth: true,
  });

  const NoDefaultAuthApi = new Restivus({
    apiPath: 'no-default-auth',
    useDefaultAuth: false,
  });

  const LegacyDefaultAuthApi = new Restivus({
    apiPath: 'legacy-default-auth',
    useDefaultAuth: true,
  });

  const LegacyNoDefaultAuthApi = new Restivus({
    apiPath: 'legacy-no-default-auth',
    useDefaultAuth: false,
  });

  const CustomErrorAuthApi = new Restivus({
    apiPath: 'custom-error-auth',
    useDefaultAuth: true,
    auth: {
      token: 'services.resume.loginTokens.hashedToken',
      user() {
        const userId = this.request.headers['x-user-id'];
        const token = this.request.headers['x-auth-token'];
        if(!(userId && token)) {
          return {
            error: {
              statusCode: 499,
              body: 'Error!',
            },
            userId: true, // Should be ignored
            token: true, // Should be ignored
          };
        }
        return {
          userId: userId,
          token : Accounts._hashLoginToken(token),
        };
      },
    },
  });

  NoDefaultAuthApi.addRoute('require-auth', { authRequired: true }, {
    get() {
      return {
        data: 'test',
      };
    },
  });

  DefaultAuthApi.addRoute('prevent-access-after-logout', { authRequired: true }, {
    get() {
      return true;
    },
  });

  CustomErrorAuthApi.addRoute('test', { authRequired: true }, {
    get() {
      return true;
    },
  });

  describe('Authentication', function () {
    it('can be required even when the default endpoints aren\'t configured', function (test, waitFor) {
      var startTime;
      startTime = new Date();
      HTTP.get(Meteor.absoluteUrl('no-default-auth/require-auth'), waitFor(function (error, result) {
        var durationInMilliseconds, response;
        response = result.data;
        test.isTrue(error);
        test.equal(result.statusCode, 401);
        test.equal(response.status, 'error');
        durationInMilliseconds = new Date() - startTime;
        // Check for security delay for failed auth
        test.isTrue(durationInMilliseconds >= 500);
      }));
    });

    describe('The default authentication endpoints', function () {
      var email, emailLoginToken, password, token, userId, username;
      token = null;
      emailLoginToken = null;
      username = 'test';
      email = 'test@ivus.com';
      password = 'password';
      // Delete the test account if it's still present
      Meteor.users.remove({
        username: username,
      });
      userId = Accounts.createUser({
        username: username,
        email   : email,
        password: password,
      });
      it('should only be available when configured', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            user    : username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
        }));
        HTTP.post(Meteor.absoluteUrl('no-default-auth/login'), {
          data: {
            user    : username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var ref, ref1, response;
          response = result.data;
          test.isUndefined(response != null ? (ref = response.data) != null ? ref.userId : void 0 : void 0);
          test.isUndefined(response != null ? (ref1 = response.data) != null ? ref1.authToken : void 0 : void 0);
        }));
        HTTP.post(Meteor.absoluteUrl('legacy-default-auth/login'), {
          data: {
            user    : username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
        }));
        HTTP.post(Meteor.absoluteUrl('legacy-no-default-auth/login'), {
          data: {
            user    : username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var ref, ref1, response;
          response = result.data;
          test.isUndefined(response != null ? (ref = response.data) != null ? ref.userId : void 0 : void 0);
          test.isUndefined(response != null ? (ref1 = response.data) != null ? ref1.authToken : void 0 : void 0);
        }));
      });
      it('should allow a user to login', function (test, waitFor) {
        // Explicit username
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            username: username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
        }));
        // Explicit email
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            email   : email,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
        }));
        // Implicit username
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            user    : username,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
        }));
        // Implicit email
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            user    : email,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
          // Store the token for later use
          token = response.data.authToken;
        }));
      });
      it('should allow a user to login again, without affecting the first login', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            user    : email,
            password: password,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.isTrue(response.data.authToken);
          test.notEqual(token, response.data.authToken);
          // Store the token for later use
          emailLoginToken = response.data.authToken;
        }));
      });
      it('should not allow a user with wrong password to login and should respond after 500 msec', function (test, waitFor) {
        var startTime;
        // This test should take 500 msec or more. To speed up testing, these two tests have been combined.
        startTime = new Date();
        HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
          data: {
            user    : username,
            password: "NotAllowed",
          },
        }, waitFor(function (error, result) {
          var durationInMilliseconds, response;
          response = result.data;
          test.equal(result.statusCode, 401);
          test.equal(response.status, 'error');
          durationInMilliseconds = new Date() - startTime;
          test.isTrue(durationInMilliseconds >= 500);
        }));
      });
      it('should allow a user to logout', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('default-auth/logout'), {
          headers: {
            'X-User-Id'   : userId,
            'X-Auth-Token': token,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
        }));
      });
      it('should remove the logout token after logging out and should respond after 500 msec', function (test, waitFor) {
        var startTime;
        // This test should take 500 msec or more. To speed up testing, these two tests have been combined.
        startTime = new Date();
        HTTP.get(Meteor.absoluteUrl('default-auth/prevent-access-after-logout'), {
          headers: {
            'X-User-Id'   : userId,
            'X-Auth-Token': token,
          },
        }, waitFor(function (error, result) {
          var durationInMilliseconds, response;
          response = result.data;
          test.isTrue(error);
          test.equal(result.statusCode, 401);
          test.equal(response.status, 'error');
          durationInMilliseconds = new Date() - startTime;
          test.isTrue(durationInMilliseconds >= 500);
        }));
      });
      it('should allow a second logged in user to logout', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('default-auth/logout'), {
          headers: {
            'X-User-Id'   : userId,
            'X-Auth-Token': emailLoginToken,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
        }));
      });
    });

    describe('An API with custom auth (with a custom error response)', function () {
      it('should return a custom error response when provided', function (test, waitFor) {
        // Omit auth headers to trigger error
        HTTP.get(Meteor.absoluteUrl('custom-error-auth/test'), {}, waitFor(function (error, result) {
          test.isTrue(error);
          test.equal(result.statusCode, 499);
          test.equal(result.data, 'Error!');
        }));
      });
    });
  });
});
