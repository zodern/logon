#!/usr/bin/env node

var fs = require('fs')
var spawn = require('child_process').spawn
var shasum = require('crypto').createHash('sha1');

var prompt = require('prompt');


function startRepl(prompt)
{
  console.log('Starting REPL session')

  require('repl').start(prompt+'> ').on('exit', function()
  {
    console.log('Got "exit" event from repl!');
    process.exit(2);
  });
}

function failure(pending, error)
{
  if(error) console.error(error.message || error);

  if(pending) return;

  process.exit()
}


var config;
var HOME;

var uid, gid;

var tries_username = 3
var tries_password = 3


var schema =
{
  properties:
  {
    username:
    {
      type: 'string',
      required: true,
      conform: function(value)
      {
        // Get user's $HOME directory
        HOME = '/home/'+value

        try
        {
          var statsHome = fs.statSync(HOME)
        }
        catch(err)
        {
          if(err.code != 'ENOENT') throw err
          return failure(--tries_username, 'User '+value+' not found');
        }

        // Get user's logon configuration
        var logon = HOME+'/etc/logon.json'

        var stats = fs.statSync(logon);

        uid = stats.uid;
        gid = stats.gid;

        try
        {
          if(statsHome.uid != uid || statsHome.gid != gid)
            throw HOME+" uid & gid don't match with its logon"

          config = require(logon)
        }
        catch(error)
        {
          return failure(--tries_username, error);
        }

        // Check if account is password-less (for example, a guest account)
        var password = config.password
        if(password === '')
        {
          prompt.override = prompt.override || {}
          prompt.override.password = ''

          return true
        }

        if(typeof password == 'string') return true;

        // User don't have defined a password, it's a non-interactive account
        failure(--tries_username, 'Non-interactive account')
      }
    },
    password:
    {
      type: 'string',
      required: true,
      hidden: true,
      allowEmpty: true,
      conform: function(value)
      {
        var password = config.password

        var result = password == ''
                  || password == shasum.update(value).digest('hex')
        if(result) return true

        failure(--tries_password)
      }
    }
  }
};

//
// Start the prompt
//
prompt.start({message: 'Welcome to NodeOS!'.rainbow});

//
// Get two properties from the user: username and password
//
prompt.get(schema, function(err, result)
{
  if(err) return;

  process.chdir(HOME)

  process.setgid(gid);
  process.setuid(uid);
  process.env.HOME = HOME;
  process.env.PATH = HOME+'/bin:/bin';

  spawn(config.shell, [],
  {
    stdio: 'inherit',
    detached: true,

    cwd: HOME
  })
  .on('error', function(error)
  {
    console.trace(error)

    startRepl('logon')
  })
  .on('exit', function(code)
  {
    process.exit(code);
  });
});
