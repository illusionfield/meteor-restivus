'use strict';

Package.describe({
  summary: 'Create authenticated REST APIs in Meteor 1.7+ via HTTP/HTTPS. Setup CRUD endpoints for Collections.',
  version: '0.9.0',
  name: 'illusionfield:restivus',
  git: 'https://github.com/illusionfield/meteor-restivus.git',
});

Package.onUse(api => {
  api.versionsFrom('1.7');

  api.use([
    'ecmascript',
    'check',
    'underscore',
    'ddp',
    'ddp-common',
    'accounts-password',
    'simple:json-routes@2.1.0'
  ], 'server');

  api.addFiles([
    'lib/auth.js',
    'lib/route.js'
  ], 'server');

  api.export([
    'Restivus',
  ], 'server');

  api.mainModule('lib/restivus.js', 'server');
});

Package.onTest(api => {
  api.use([
    'illusionfield:restivus',
    'ecmascript',
    'ddp',
    'ddp-common',
    'practicalmeteor:munit',
    'test-helpers',
    'http',
    'underscore',
    'accounts-base',
    'accounts-password',
    'mongo',
    'simple:json-routes@2.1.0'
  ], 'server');

  api.addFiles([
    'test/api_tests.js',
    'test/route_unit_tests.js',
    'test/authentication_tests.js',
    'test/user_hook_tests.js'
  ], 'server');
});
