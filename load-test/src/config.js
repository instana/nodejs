'use strict';
module.exports = {
  instana: {
    sensorEnabled: true,
    agentPort: process.env.AGENT_PORT || null
  },
  server: {
    port: process.env.APP_PORT || 3333
  },
  services: {
    mongo: {
      host: process.env.MONGODB || '127.0.0.1:27017'
    },
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PW || 'nodepw',
      database: process.env.MYSQL_DB || 'nodedb',
      table: 'loadtest'
    },
    redis: {
      host: process.env.REDIS || '127.0.0.1:6379'
    }
  }
};
