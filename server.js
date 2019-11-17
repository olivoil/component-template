const sirv = require('sirv');
const compression = require('compression');
const polka = require('polka');
const { render } = require('mustache');
const livereload = require('easy-livereload');
const fs = require('fs');
const path = require('path');
const ssr = require('./build/server');
const pkg = require('./package.json');

const { PORT = '3001', NODE_ENV = 'development' } = process.env;
const dev = NODE_ENV === 'development';

const buf = fs.readFileSync('./_template.html', 'utf8');
const template = buf.toString();
const livescript = { locals: {} };

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

polka() // You can also use Express
  .use(
    compression({ threshold: 0 }),
    sirv('static', { dev }),
    sirv('build', { dev }),
    livereload({
      app: livescript,
      watchDirs: [
        path.join(__dirname, 'build'),
        path.join(__dirname, 'static'),
      ],
    }),
    (req, res) => {
      console.log('new request');
      console.log(req);
      const { html, css, head } = ssr.render(req.query);
      //console.log(html, css, head);

      res.writeHead(200, {
        'Content-Type': 'text/html',
      });

      const view = {
        html,
        styles: [`<style>${css.code}</style>`],
        head,
        scripts: `<script src='client.js'></script>
          <script>
          new ${name}({
            target: document.getElementById('sapper'),
            hydrate: true,
            props: {
		          names: [${req.query.names ? req.query.names.join(',') : ''}]
	          }
          });
        </script>
        ${livescript.locals.LRScript}`,
      };

      res.end(render(template, view));
    }
  )
  .listen(PORT, err => {
    if (err) console.log('error', err);
    console.log(`listening on port ${PORT}`);
  });
