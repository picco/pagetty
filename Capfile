load 'deploy'

default_environment['NODE_ENV'] = "production"
default_run_options[:pty] = true

set :application, "pagetty"
set :repository,  "git@github.com:picco/pagetty.git"
set :scm, :git
set :ssh_options, {:forward_agent => true}
set :deploy_to, "/srv/pagetty"
set :deploy_via, :remote_cache
set :user, "root"
set :use_sudo, false

server "pagetty.com", :app, {
  :ssh_options => {
    :keys => './config/keys/pagetty_rsa'
  }
}

# Configure: Configure the server using puppet.

namespace :configure do
  task :default do
    set :user, "root"
    set :default_shell, "bash"    

    run("hostname pagetty.com")
    run("apt-get install -y puppet")
    
    system("tar czf 'puppet.tgz' puppet/")
    upload("puppet.tgz","/tmp/puppet.tgz",:via => :scp)
    system("rm puppet.tgz")
    run("tar xzf /tmp/puppet.tgz -C /tmp")
    run("rm -rf /etc/puppet")
    run("mv /tmp/puppet /etc/puppet")
    run("puppet apply /etc/puppet/manifests/site.pp")
    run("mkdir -p /srv/pagetty")
    run("chown pagetty /srv/pagetty")
  end
end

# Deply

namespace :deploy do
  set :user, "pagetty"

  task :stop do
    run "forever stopall"
  end

  task :start do
    run "env"
    run "cd #{current_path} && forever start app.js"
    run "cd #{current_path} && forever start update.js"
  end

  task :restart do
    stop
    sleep 5
    start
  end

  task :npm_install do
    run "mkdir -p #{shared_path}/node_modules"
    run "ln -s #{shared_path}/node_modules #{release_path}/node_modules"      
    run "cd #{release_path} && npm install"
  end
end

after "deploy:finalize_update", "deploy:npm_install"
