// qbzf-00
// - 00
// - prerequisite:
// - make public/fonts/Fredoka-SemiBold-c--coquí.qbfz
// - make public/fonts/Fredoka-SemiBold--tile-labels.qbfz
const glsl = require('glslify')
const regl = require('regl')({
   extensions: [
    'oes_element_index_uint',
    'oes_texture_float',
    'EXT_float_blend'
  ],
})
const QBZF = require('qbzf')

let draw = null
const data = { curves: null, grid: null }

window.addEventListener('resize', frame)

const textOptions = {
  coqui: {
    url: 'fonts/Fredoka-SemiBold-c--coqui.qbfz',
    text: 'coquí',
  },
  tileLabel: {
    url: 'fonts/dejavu-sans.bold--tile-labels.qbfz',
    text: '9-8-7',
  },
}
const url = new URL(window.location)
const searchParams = new URLSearchParams(url.search)
const text = searchParams.get('text') === 'coqui'
  ? textOptions.coqui
  : textOptions.tileLabel

async function main () {
  const resp = await fetch(text.url)
  const buf = await resp.arrayBuffer()
  fromData(new Uint8Array(buf))
}
main()

function fromData (buf) {
  const qbzf = new QBZF(buf)
  data.curves = qbzf.curves
  data.curves.texture = regl.texture(data.curves)
  data.grid = qbzf.write({
    text: text.text,
    strokeWidth: 4,
  })
  data.grid.texture = regl.texture(data.grid)
  draw = build(data.grid.n)
  frame()
}

function frame () {
  regl.poll()
  regl.clear({ color: [0, 0, 0, 1], depth: true })
  if (data) draw(data)
}

function build (n) {
  return regl({
    attributes: {
      position: [-4,-4,-4,+4,+4,+0],
    },
    elements: [0, 1, 2],
    uniforms: {
      curveTex: regl.prop('curves.texture'),
      curveSize: regl.prop('curves.size'),
      gridTex: regl.prop('grid.texture'),
      gridUnits: regl.prop('grid.units'),
      gridSize: regl.prop('grid.grid'),
      gridDim: regl.prop('grid.dimension'),
      gridN: n,
      strokeWidth: regl.prop('grid.strokeWidth'),
    },
    vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 vpos;
      void main () {
        vpos = position;
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: glsl`
      precision highp float;
      
      #pragma glslify: QBZF = require('qbzf/h')
      #pragma glslify: create_qbzf = require('qbzf/create')
      #pragma glslify: read_curve = require('qbzf/read')

      varying vec2 vpos;
      uniform sampler2D curveTex, gridTex;
      uniform vec2 curveSize, gridUnits, gridSize, gridDim;
      uniform float gridN, strokeWidth;

      void main () {
        vec2 uv = vpos * 0.5 + 0.5;
        QBZF qbzf = create_qbzf(
          uv, gridN, gridSize, gridUnits, gridDim,
          gridTex, curveSize
        );
        float ldist = 1e30;
        for (int i = 0; i < ${n}; i++) {
          vec4 curve = read_curve(qbzf, gridTex, curveTex, float(i));
          if (curve.x < 0.5) break;
          qbzf.count += curve.y;
          ldist = min(ldist, length(curve.zw));
        }
        float a = 5.0; // aliasin width in font units
        float outline = 1.0 - smoothstep(strokeWidth - a, strokeWidth + a, ldist);
        vec3 fill = vec3(0);
        vec3 stroke = vec3(1);
        vec3 bg = vec3(0.5, 0, 1);
        vec3 c = mix(
          mix(bg, stroke, outline),
          mix(stroke, fill, smoothstep(ldist, 0.0, a)),
          mod(qbzf.count, 2.0)
        );
        gl_FragColor = vec4(c, 1);
      }
    `,
  })
}
