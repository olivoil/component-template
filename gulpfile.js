const { src, dest } = require('gulp');
const npm = require('npm');
const pkg = require('./package.json');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

exports.dist = async () => {
  await new Promise(resolve => npm.load(resolve));

  // trigger rollup build
  await new Promise((resolve, reject) =>
    npm.run('build', err => {
      if (err) return reject(err);
      resolve();
    })
  );

  if (fs.existsSync('./dist')) {
    fs.rmdirSync('./dist', { recursive: true });
  }

  fs.mkdirSync('./dist');

  // copy static files
  src('static').pipe(dest('./dist/'));

  // parse task arguments
  const props = yargs.argv.props || {};
  const target = yargs.argv.target || 'document.body';

  // render server side resources
  const ssr = require('./build/server');
  const { html, css, head } = ssr.render(props);

  fs.writeFileSync('./dist/body.html', html);
  if (css.code) fs.writeFileSync('./dist/style.css', css.code);
  if (head) fs.writeFileSync('./dist/head.html', head);

  const js = fs.readFileSync(path.join(__dirname, 'build/client.js'), 'utf8');
  const scripts = `
<script>${js}</script>

<script>
  new ${name}({
    target: ${target},
    hydrate: true,
    props: ${props}
  });
</script>`;

  fs.writeFileSync('dist/scripts.html', scripts);
};
