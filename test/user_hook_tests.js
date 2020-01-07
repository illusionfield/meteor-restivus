import { Restivus } from '../lib/restivus.js';

Meteor.startup(function () {
  const HookApi = new Restivus({
    useDefaultAuth: true,
    apiPath: 'hook-api',
    onLoggedIn() {
      return Meteor.users.findOne({_id: this.userId});
    },
    onLoggedOut() {
      return Meteor.users.findOne({_id: this.userId});
    },
  });

  const DefaultApi = new Restivus({
    useDefaultAuth: true,
    apiPath: 'no-hook-api',
  });

  describe('User login and logout', function () {
    var token = null;
    const username = 'test2';
    const email = 'test2@ivus.com';
    const password = 'password';
    // Delete the test account if it's still present
    Meteor.users.remove({username});
    const userId = Accounts.createUser({username, email, password});

    describe('with hook returns', function () {
      it('should call the onLoggedIn hook and attach returned data to the response as data.extra', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('hook-api/login'), {
          data: { username, password }
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.userId, userId);
          test.equal(response.data.extra.username, username);
          // Store the token for later use
          token = response.data.authToken;
        }));
      });
      it('should call the onLoggedOut hook and attach returned data to the response as data.extra', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('hook-api/logout'), {
          headers: {
            'X-User-Id'   : userId,
            'X-Auth-Token': token,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.equal(response.data.extra.username, username);
        }));
      });
    });

    describe('without hook returns', function () {
      it('should not attach data.extra to the response when login is called', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('no-hook-api/login'), {
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
          test.isUndefined(response.data.extra);
          // Store the token for later use
          token = response.data.authToken;
        }));
      });
      it('should not attach data.extra to the response when logout is called', function (test, waitFor) {
        HTTP.post(Meteor.absoluteUrl('no-hook-api/logout'), {
          headers: {
            'X-User-Id'   : userId,
            'X-Auth-Token': token,
          },
        }, waitFor(function (error, result) {
          var response;
          response = result.data;
          test.equal(result.statusCode, 200);
          test.equal(response.status, 'success');
          test.isUndefined(response.data.extra);
        }));
      });
    });
  });
});
