'use strict';

module.exports = {
  setAuthHeader,
};

function setAuthHeader(context, events, done) {
  const token = context.vars.token;
  if (token && typeof token === 'string') {
    context.vars = context.vars || {};
    context.vars.__authHeader = `Bearer ${token}`;
    context.request = context.request || {};
    context.request.headers = context.request.headers || {};
    context.request.headers.Authorization = context.vars.__authHeader;
  }
  return done();
}
