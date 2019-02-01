'use strict'
const merge = require('webpack-merge')
const prodEnv = require('./prod.env')

module.exports = merge(prodEnv, {
  NODE_ENV: '"development"',
  VUE_APP_SERVER_URL: '"http://localhost:8085"',
  VUE_APP_WS_URL: '"ws://localhost:8085"'
})
