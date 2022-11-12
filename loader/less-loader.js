const less = require('less')
function loader(source) {
  let css = ''
  less.render(source, (err, c) => {
    console.log(c, 'caaaaaaaa')
    css = c.css
  })
  css.replace('/\n/g', '\\n')
  return css
}

module.exports = loader