// coqui-radiating-00
// - 00
// - loads the font, vectorizes it, and renders it

const regl = require('regl')()
const vectorizeText = require("vectorize-text")

const draw = regl({
  attributes: {
    position: regl.prop('positions'),
  },
  elements: regl.prop('cells'),
  uniforms: {
    width: regl.prop('width'),
    aspect: ({ viewportWidth, viewportHeight}) => viewportWidth / viewportHeight,
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform float width, aspect;
    void main () {
      vec2 flipY = vec2(1.0, -1.0);
      vec2 scale = vec2(0.5);
      vec2 offset = vec2(-0.5, 0.25);
      vec2 p = position * flipY * scale + offset;
      gl_Position = vec4(p.x, p.y * aspect, 0, 1);
    }  
  `,
  frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
    }
  `,
})

async function main () {
  const font = new FontFace('Fredoka', "url('fonts/Fredoka-SemiBold.ttf')")
  await font.load()
  document.fonts.add(font)
  const width = 2
  const mesh = vectorizeText("coquí", {
    triangles: true,
    width,
    textBaseline: "hanging",
    font: 'Fredoka',
    fontStyle: 'bold',
    simplify: false,
  })
  const props = Object.assign(mesh, {width})
  console.log({props})
  regl.frame(() => {
    regl.clear({ color: [0,0,0,1] })
    draw(props)
  })

}
main()