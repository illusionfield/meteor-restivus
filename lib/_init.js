import { Meteor } from 'meteor/meteor';
import url from 'url';

import bodyParser from 'body-parser';

WebApp.connectHandlers.use(bodyParser.urlencoded({limit: '50mb', extended: true})); //Override default request size
WebApp.connectHandlers.use(bodyParser.json({limit: '50mb'})); //Override default request size
WebApp.connectHandlers.use((req, res, next) => {
  req.query = url.parse(req.url, true).query;
  next();
});
