'use strict';

Package.describe({
  summary: 'Create authenticated REST APIs in Meteor 2.6+ via HTTP/HTTPS. Setup CRUD endpoints for Collections.',
  version: '0.9.3',
  name: 'illusionfield:restivus',
  git: 'https://github.com/illusionfield/meteor-restivus.git',
  documentation: 'README.md',
});

Npm.depends({
  'body-parser': '2.0.1',
});

Package.onUse(api => {
  api.versionsFrom('2.6');
  configure(api);

  api.mainModule('lib/restivus.js', 'server');
  api.export('Restivus', 'server');
});

Package.onTest(api => {
  api.versionsFrom('2.6');
  configure(api);

  api.use([
    'practicalmeteor:munit@2.1.5',
    'test-helpers',
    'http@2.0.0',
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
