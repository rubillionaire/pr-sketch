// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - intial choo setup for the scroll

var app = require('choo')()
var html = require('choo/html')
const mixmap = require('@rubenrodriguez/mixmap')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { create, config } = require('./map')

const prefix = css('./style.css')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const mapFadingIn = create({ mix })
const mapCycle = create({ mix })

const mapFadingInConfig = config({ map: mapFadingIn })
const mapCycleConfig = config({ map: mapCycle })

function mapScroll (state, emit) {
  return html`<body class=${prefix}>
    ${mix.render()}
    <main class="stack">
      <header class="bg-light">
        <hgroup class="p-8">
          <h1 class="text-dark line-height-1">Puerto Rico</h1>
          <p class="text-dark">a map by <a class="text-dark" href="https://rubenrodriguez.me" target="_blank">rubén rodríguez</a></p>
        </hgroup>
      </header>
      <section id="map-fading-in" class="bg-light">
        ${mapFadingIn.render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>
      <section class="bg-light">
        ${mapCycle.render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}  
      </section>
    </main>
  </body>`
}

app.route('/', mapScroll)
app.route('/*', mapScroll)

app.use(function (state, emitter) {
  state.tickCycle = 0
  state.tickFadeIn = 295
  state.playing = true
  
  mapFadingInConfig.updateLightPositionForTick({ tick: state.tickFadeIn })
  
  emitter.on('DOMContentLoaded', () => {   // 2.
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
    frame(state)

    window.addEventListener('scroll', () => {
      console.log('scroll')
    })

    const intersectionObserver = new IntersectionObserver((entries) => {
      console.log({entries});
    });
    // start observing
    intersectionObserver.observe(document.getElementById("map-fading-in"))
  })

  function frame () {
    mapCycleConfig.updateLightPositionForTick({ tick: state.tickCycle })
    mix.draw()
    state.tickCycle += 1
    if (state.playing) window.requestAnimationFrame(frame)
  }
})

app.mount('body')
