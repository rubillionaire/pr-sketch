// coqui-radiating-01
// - 00
// - loads the font, vectorizes it, and renders it
// - 01
// - split word into individual draw calls
// - rotate characters and have them radiate out, fading in and out

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
    charOffset: regl.prop('charOffset'),
    tick: ({ tick }) => tick,
  },
  blend: {
    enable: true,
    func: {
      src: 'src alpha',
      dst: 'one minus src alpha'
    },
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform float width, aspect, charOffset, tick;
    varying float vNormalizedRadius;
    
    const float PI = ${Math.PI};

    mat2 rotate2d (float _angle) {
      return mat2(
        cos(_angle), -sin(_angle),
        sin(_angle), cos(_angle)
      );
    }

    void main () {
      vec2 flipY = vec2(1.0, -1.0);
      vec2 scale = vec2(0.25);
      float maxRadius = 0.4;
      float radius = mod(tick * 0.001, maxRadius);
      float normalizedRadius = radius/maxRadius;
      // char offset is range -1, 1
      // i want to map that onto [0, PI]
      float theta = mix(0.0, PI, 1.0 - (charOffset * 0.5 + 0.5));
      vec2 offset = vec2(cos(theta) * radius, sin(theta) * radius - 0.25);
      mat2 rotation = rotate2d(theta - PI/2.0);
      vec2 p = ((position * flipY) * rotation) * scale + offset;
      gl_Position = vec4(p.x, p.y * aspect, 0, 1.0);
      vNormalizedRadius = normalizedRadius;
    }  
  `,
  frag: `
    precision highp float;
    varying float vNormalizedRadius;
    void main () {
      float radiusRange = step(0.5, vNormalizedRadius);
      vec2 opacityDirection = mix(
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        radiusRange
      );
      vec2 smoothstepRange = mix(
        vec2(0.0, 0.5),
        vec2(0.5, 1.0),
        radiusRange
      );
      float opacity = mix(
        opacityDirection.x,
        opacityDirection.y,
        smoothstep(smoothstepRange.x, smoothstepRange.y, vNormalizedRadius)
      );
        
      gl_FragColor = vec4(1.0, 0.0, 1.0, opacity);
    }
  `,
})

async function main () {
  const font = new FontFace('Fredoka', "url('fonts/Fredoka-SemiBold.ttf')")
  await font.load()
  document.fonts.add(font)
  const width = 1
  const mark = 'coquí'
  const props = mark.split('').map((char, index, arr) => {
    const markLength = arr.length
    const middleChar = Math.round(markLength/2) - 1
    const singleCharOffset = 1/markLength
    const charOffset = index * singleCharOffset - middleChar *  singleCharOffset
    const mesh = vectorizeText(char, {
      triangles: true,
      textBaseline: "alphabetic",
      font: 'Fredoka',
      size: '10px',
      simplify: false,
      textAlign: 'center',
    })
    return Object.assign({
      width,
      charOffset,
    }, mesh)
  })
  regl.frame(() => {
    regl.clear({ color: [0,0,0,1] })
    draw(props)
  })

}
main()