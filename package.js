'use strict';

Package.describe({
  summary: 'Create authenticated REST APIs in Meteor 1.7+ via HTTP/HTTPS. Setup CRUD endpoints for Collections.',
  version: '0.9.0',
  name: 'illusionfield:restivus',
  git: 'https://github.com/illusionfield/meteor-restivus.git',
});

Npm.depends({
  'body-parser': '1.19.0',
  qs: '6.9.1',
  connect: '3.7.0',
  'connect-route': '0.1.5',
});

Package.onUse(api => {
  api.versionsFrom('1.7');
  configure(api);

  api.mainModule('lib/restivus.js', 'server');
  api.export('Restivus', 'server');
});

Package.onTest(api => {
  configure(api);

  api.use([
    'practicalmeteor:munit',
    'test-helpers',
    'http',
    'mongo',
  ], 'server');

  api.addFiles([
    'test/api_tests.js',
    'test/route_unit_tests.js',
    'test/authentication_tests.js',
    'test/user_hook_tests.js'
  ], 'server');
});

function configure(api) {
  api.use([
    'ecmascript',
    'check',
    'underscore',
    'webapp',
    'ddp',
    'ddp-common',
    'accounts-password',
   ], 'server');
}
