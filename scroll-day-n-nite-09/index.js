// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - intial choo setup for the scroll
// - 01 adds tryptich using MapFillParent component for display that responds to css parent changes
// - 02
// - refactor the maps to be created based on name, so we can more easily
//    manage dealing with all maps as a group, and then individually as
//    necessary
// - 03
// - add a row triptych
// - working on content
// - 04
// - more content refinement
// - nightMap click to see name of city and population
// - 05
// - try a scrolling interface for the city nights
var app = require('choo')()
var html = require('choo/html')
const mixmap = require('@rubenrodriguez/mixmap')
const { pickUnpack } = require('@rubenrodriguez/mixmap-georender')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { createMap, createProps, createDraws, spreadProps } = require('./map')
const MapFillParent = require('./map-fill-parent')
const SelectedCity = require('./selected-city')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const searchParamsString = window.location.search.slice(1)
const searchParams = new URLSearchParams(searchParamsString)
const colors = searchParams.has('light') && searchParams.has('dark')
  ? {
      light: JSON.parse(searchParams.get('light')).map(n => parseFloat(n)),
      dark: JSON.parse(searchParams.get('dark')).map(n => parseFloat(n)),
    }
  : undefined

let bodyStyle = ''
if (colors) {
  for (const name in colors) {
    const rgb = `rgb(${colors[name].join(', ')})`
    const property = `--color-${name}: ${rgb};`
    bodyStyle += `${property}\n`
  }
}

const mixSpecs = [
  {
    mixName: 'background',
    zindex: 0,
  },
  {
    mixName: 'foreground',
    zindex: 1,
  },
]

const mixs = []
const getMixSpec = (mixName) => mixs.find(m => m.mixName === mixName)
const getMixSpecProp = (prop) => (mixName) => getMixSpec(mixName)[prop]
const getMix = getMixSpecProp('mix')
const getMixZindex = getMixSpecProp('zindex')

for (const spec of mixSpecs) {
  const mix = mixmap(regl, {
    extensions: ['oes_element_index_uint'],
  })
  mixs.push(Object.assign({ mix }, spec))
}

const staticRadiatingCoastlineOpts = {
  tick: 0,
}
const smallRadiatingCoastlineOpts = {
  displayThreshold: 0.22,
}
const tickPositions = {
  earlymorning: { tick: 1415 },
  noon: { tick: 1600 },
  afternoon: { tick: 1700 },
  lateafternoon: { tick: 1729 },
  midnight:  { tick: 1100 },
}
const viewboxes = {
  cerroDePunta: {
    center: [-66.591839, 18.172458],
    aspect: 1,
    xRadius: 0.1,
  },
  nightSanJuan: {
    center: [-66.105735, 18.465539],
    aspect: 1,
    xRadius: 0.1, 
  },
  nightÁreaMetro: {
    center: [-66.064735, 18.425539],
    aspect: 1,
    xRadius: 0.13, 
  },
  nightPonce: {
    center: [-66.614062, 18.011077],
    aspect: 1,
    xRadius: 0.13,
  },
  nightCayey: {
    center: [-66.161564, 18.111405],
    aspect: 1,
    xRadius: 0.13,
  },
  nightFajardo: {
    center: [-65.650529, 18.325787],
    aspect: 1,
    xRadius: 0.1, 
  },
   nightManatí: {
    center: [-66.482922, 18.429664],
    aspect: 1,
    xRadius: 0.1, 
  },
   nightManatíCluster: {
    center: [-66.472922, 18.429664],
    aspect: 1,
    xRadius: 0.13, 
  }
}
const tickRanges = {
  mapFadingIn: [1350, 1420],
}
/*
disableDraws.ocean
disableDraws.coastlineShadow
disableDraws.terrainImgTile
disableDraws.radiatingCoastline
disableDraws.city
 */
const disableDraws = {
  night: {
    disableDraws: {
      coastlineShadow: true,
    },
  },
  day: {
    disableDraws: {
      city: true,
    }
  },
  inlandDay: {
    disableDraws: {
      city: true,
      coastlineShadow:  true,
      ocean: true,
      radiatingCoastline: true,
    }
  },
  inlandNight: {
    disableDraws: {
      coastlineShadow:  true,
      radiatingCoastline: true,
    }
  },
}

const maps = []
const getName = (name) => maps.find(m => m.name === name)
const getProp = (prop) => (name) => getName(name)[prop]
const setProp = (prop) => (name, state) => getName(name)[prop](state)
const mixForSpec = (spec) => spec.mix === undefined ? getMix('background') : getMix(spec.mix)
const getTick = (name) => {
  const i = maps.findIndex(m => m.name === name)
  const mix = mixForSpec(getName(name))
  return () => mix._rcom._mregl.subcontexts[i].tick
}
const getMap = getProp('map')
const getDrawCmds = getProp('drawCmds')
const setLightPosictionTick = setProp('updateLightPositionForTick')
const getGloblalContext = getProp('globalContext')
const getState = getProp('state')

const mapSpecs = [
  {
    name: 'overlappingTopRightCerroDePuntaNoon',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.noon,
    mixName: 'foreground',
  },
  {
    name: 'overlappingBottomLeftCerroDePuntaEarlyMorning',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.earlymorning,
    mixName: 'background',
  },
  {
    name: 'overlappingBottomRightNightSanJuan',
    mapProps: {
      viewbox: viewboxes.nightSanJuan,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'overlappingTopLeftNightFajardo',
    mapProps: {
      viewbox: viewboxes.nightFajardo,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'cerroDePuntaNoon',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.noon,
    mixName: 'background',
  },
  {
    name: 'cerroDePuntaEarlyMorning',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.earlymorning,
    mixName: 'background',
  },
  {
    name: 'cerroDePuntaLateAfternoon',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.lateafternoon,
    mixName: 'background',
  },
  {
    name: 'nightSanJuan',
    mapProps: {
      viewbox: viewboxes.nightÁreaMetro,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'nightManatíCluster',
    mapProps: {
      viewbox: viewboxes.nightManatíCluster,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'nightCayey',
    mapProps: {
      viewbox: viewboxes.nightCayey,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'nightPonce',
    mapProps: {
      viewbox: viewboxes.nightPonce,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
    mixName: 'background',
  },
  {
    name: 'cascadingTriptychDay',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.earlymorning,
    mixName: 'background',
  },
  {
    name: 'cascadingTriptychTransition',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.noon,
    mixName: 'background',
  },
  {
    name: 'cascadingTriptychNight',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.lateafternoon,
    mixName: 'background',
  },
  {
    name: 'nightMap',
    mapProps: {},
    drawProps: Object.assign({
      selectCity: 1.0,
    }, disableDraws.night),
    animated: true,
    state: Object.assign({ selectedCity: null, cities: null }, tickPositions.midnight),
    mixName: 'background',
  },
  {
    name: 'mapCycle',
    mapProps: {},
    drawProps: {},
    animated: true,
    state: {
      playing: true,
      tick: 0,
    },
    mixName: 'background',
  },
  {
    name: 'mapFadingIn',
    mapProps: {},
    drawProps: {},
    animated: true,
    state: {
      tick: tickRanges['mapFadingIn'][0],
      tickRange: tickRanges['mapFadingIn'],
    },
    mixName: 'background',
  },
].sort((a, b) => {
  const am = getMixZindex(a.mixName)
  const bm = getMixZindex(b.mixName)
  return am - bm
})

for (const spec of mapSpecs) {
  const { name, mapProps, drawProps } = spec
  if (mapProps.viewbox && !Array.isArray(mapProps.viewbox)) {
    const vb = mapProps.viewbox
    if (vb.center && vb.aspect === 1 && vb.xRadius) {
      mapProps.viewbox = [
        vb.center[0] - vb.xRadius,
        vb.center[1] - vb.xRadius,
        vb.center[0] + vb.xRadius,
        vb.center[1] + vb.xRadius,
      ]
    }
  }
  const mix = mixForSpec(spec)
  const { map } = createMap(Object.assign({ mix, name, colors }, mapProps))
  const drawOpts = createDraws(Object.assign({ map, colors }, drawProps))
  maps.push(Object.assign({ map }, spec, drawOpts))
}

const mapPerMix = mixs
  .map(({ mixName, mix }) => {
    const { map } = maps.find(s => s.mixName === mixName)
    return { mixName, map }
  })

function mapScroll2 (state, emit) {
  return html`<body class=${prefix} style=${bodyStyle}>
    ${mixs.map(({ mixName, mix }) => {
      return mix.render()
    })}
    <main class="relative stack gap-2">
      <section class="relative overlapping-corners">
        <div class="top-right">
          <div class="relative full-width full-height">
            ${state.cache(MapFillParent, 'overlappingTopRightCerroDePuntaNoon').render({
              map: getMap('overlappingTopRightCerroDePuntaNoon'),
              props: {
                width: 0,
                height: 0,
                mouse: false,
                attributes: {
                  class: 'map',
                },
              }
            })}
          </div>
        </div>
        <div class="top-left">
          ${state.cache(MapFillParent, 'overlappingBottomRightNightSanJuan').render({
              map: getMap('overlappingBottomRightNightSanJuan'),
              props: {
                width: 0,
                height: 0,
                mouse: false,
                attributes: {
                  class: 'map',
                },
              }
            })}
        </div>
        <div class="bottom-left">
          <div class="relative full-width full-height">
            ${state.cache(MapFillParent, 'overlappingBottomLeftCerroDePuntaEarlyMorning').render({
              map: getMap('overlappingBottomLeftCerroDePuntaEarlyMorning'),
              props: {
                width: 0,
                height: 0,
                mouse: false,
                attributes: {
                  class: 'map',
                },
              }
            })}
          </div>
        </div>
        <div class="bottom-right">
          ${state.cache(MapFillParent, 'overlappingTopLeftNightFajardo').render({
              map: getMap('overlappingTopLeftNightFajardo'),
              props: {
                width: 0,
                height: 0,
                mouse: false,
                attributes: {
                  class: 'map',
                },
              }
            })}
        </div>
      </section>

      <header class="bg-light">
        <hgroup class="p-8">
          <h1 class="text-dark line-height-1">1-bit Puerto Rico</h1>
          <p class="text-dark">terrain by day, city lights at night<br/>
            a map by <a class="text-dark" href="https://rubenrodriguez.me" target="_blank">rubén rodríguez</a>
          </p>
        </hgroup>
      </header>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>This is a tiny love letter to Puerto Rico with its beautiful mountains,
            and lively cities. The map has two primary phases that highlight these 
            facets and a transition between them.</p>
            <p>
              All graphics are based on a cartographic scheme
              that is either showing color, or the absence of that color. As if they
              were drawn on a piece of paper with only one pen color.
            </p>
          </div>
        </div>
      </section>

      <section id="map-fading-in" class="bg-light">
        ${getMap('mapFadingIn').render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              During the day portion of the map's cycle, we see a
              representation of the topography of Puerto Rico. The
              sun travels across the equator casting
              shadows over the central mountain range,
              <a
                href="https://en.wikipedia.org/wiki/Cordillera_Central_(Puerto_Rico)"
                target="_blank"
              >Cordillera Central</a>.
            </p>
          </div>
        </div>
      </section>

      <section id="cascading-triptych" class="box-border full-width p-4 bg-light">
        <div class="cascading-triptych-grid gap-4">
          <div class="stack gap-2">
            <figure class="aspect-pr overflow-hidden">
              ${state.cache(MapFillParent, 'cascadingTriptychDay').render({
                  map: getMap('cascadingTriptychDay'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption>Early morning.</caption>
          </div>
          <div class="stack gap-2">
            <figure class="aspect-pr overflow-hidden">
              ${state.cache(MapFillParent, 'cascadingTriptychTransition').render({
                  map: getMap('cascadingTriptychTransition'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption>Noon.</caption>
          </div>
          <div class="stack gap-2">
            <figure class="aspect-pr overflow-hidden">
              ${state.cache(MapFillParent, 'cascadingTriptychNight').render({
                  map: getMap('cascadingTriptychNight'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption>Late afternoon.</caption>
          </div>
        </div>
      </section>

      <section class="box-border full-width px-4 py-16 bg-light">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              The highest peak in Puerto Rico is that of 
              <a
                href="https://en.wikipedia.org/wiki/Cerro_de_Punta"
                target="_blank"
              >Cerro de Punta</a>, which peaks at 1,338 meters above sea level.
              It is said the best view of Puerto Rico.
            </p>
          </div>
        </div>
        <div class="row-triptych-grid subgrid">
          <div>
            <figure class="figure-1 aspect-1 overflow-hidden">
              ${state.cache(MapFillParent, 'cerroDePuntaEarlyMorning').render({
                  map: getMap('cerroDePuntaEarlyMorning'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption class="caption-1">Early morning.</caption>
          </div>
          <div>
            <figure class="figure-2 aspect-1 overflow-hidden">
              ${state.cache(MapFillParent, 'cerroDePuntaNoon').render({
                  map: getMap('cerroDePuntaNoon'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}  
            </figure>
            <caption class="caption-2">Noon.</caption>
          </div>
          <div>
            <figure class="figure-3 aspect-1 overflow-hidden">
              ${state.cache(MapFillParent, 'cerroDePuntaLateAfternoon').render({
                  map: getMap('cerroDePuntaLateAfternoon'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption class="caption-3">Late afternoon.</caption>
          </div>
        </div>
      </section>

      <section class="box-border px-4 py-16 bg-dark">
        <div class="relative full-width">
          <div class="stack items-center">
            <div class="max-width-text text-light text-start">
              <p>
                While the night cycle of the map showcases the glimmering
                lights of the twenty most populated cities.
              </p>
            </div>
          </div>
          <div id="night-map" class="relative box-border gap-4" >
            <div class="selected-city">
              <figure class="full-width full-height">
                <div class="full-width full-height overflow-hidden">
                  ${state.cache(MapFillParent, 'nightMap').render({
                      map: getMap('nightMap'),
                      props: {
                        width: 0,
                        height: 0,
                        mouse: false,
                        attributes: {
                          class: 'map',
                        },
                      }
                    })}
                </div>
              </figure>
              <caption class="full-width text-light text-start">
                <div class="stack items-center">
                  <div class="max-width-text text-light text-start">
                    ${state.cache(SelectedCity, 'selected-city').render(state.nightMap)}
                  </div>
                </div>
              </caption>
            </div>
          </div>
        </div>
      </section>

      <section class="box-border px-4 py-16">
        <div class="relative full-width stack gap-16">
          <div class="stack items-center">
            <div class="max-width-text text-start">
              <p>
                The most populated metropolitan statistical area of Puerto Rico is referred to as
                <a
                  href="https://en.wikipedia.org/wiki/San_Juan–Bayamón–Caguas_metropolitan_area"
                  target="_blank"
                >Área Metro</a>, which includes the cities of San Juan, Bayamón,
                Carolina, Guaynabo, Trujillo Alto & Cataño.
              </p>
              <div class="aspect-1 overflow-hidden">
                ${state.cache(MapFillParent, 'nightSanJuan').render({
                  map: getMap('nightSanJuan'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
              </div>
            </div>
          </div>
          <div class="city-highlight-grid">
            <div class="x-ponce">
              <figure class="full-width full-height overflow-hidden">
                ${state.cache(MapFillParent, 'nightPonce').render({
                    map: getMap('nightPonce'),
                    props: {
                      width: 0,
                      height: 0,
                      mouse: false,
                      attributes: {
                        class: 'map',
                      },
                    }
                  })}
              </figure>
              <caption>
                Ponce is the heart of the <a
                  href="https://en.wikipedia.org/wiki/Ponce_metropolitan_area"
                  target="_blank"
                >Ponce Metropolitan Area</a>.
              </caption>
            </div>
            <div class="x-cluster">
              <figure class="full-width full-height overflow-hidden">
                ${state.cache(MapFillParent, 'nightManatíCluster').render({
                    map: getMap('nightManatíCluster'),
                    props: {
                      width: 0,
                      height: 0,
                      mouse: false,
                      attributes: {
                        class: 'map',
                      },
                    }
                  })}
              </figure>
              <caption class="">
                Barceloneta, Manatí and Vega Baja are clustered in the center of the
                island along the northern coast.
              </caption>
            </div>
            <div class="x-cayey">
              <figure class="full-width full-height overflow-hidden">
                ${state.cache(MapFillParent, 'nightCayey').render({
                    map: getMap('nightCayey'),
                    props: {
                      width: 0,
                      height: 0,
                      mouse: false,
                      attributes: {
                        class: 'map',
                      },
                    }
                  })}
              </figure>
              <caption class="">
                Cayey is a one of the larger mountain towns on the island.
              </caption>
            </div>
          </div>
        </div>
      </section>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              All together we get a cycle that shows two aspects of the island
              and a bit of how they are related. Astute observers will notice
              that the most populated cities are primarily on the coast of the
              island due to the very mountainous interior.
            </p>
          </div>
        </div>
      </section>

      <section class="bg-light">
        ${getMap('mapCycle').render({
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
async function mapScroll2Store (state, emitter) {
  let cities
  let setHighlight
  let highlightAllCities = []

  for (const { name } of maps) {
    state[name] = getState(name)
    if (getState(name).hasOwnProperty('tick')) {
      setLightPosictionTick(name, getState(name))
    }
  }

  createProps({ maps: mapPerMix }).then(({ props, cityJson }) => {
    cities = cityJson
    state.nightMap.cities = cities
    for (let i = 0; i < cities.length; i++) {
      let city = cities[i]
      city.populationFormatted = new Intl.NumberFormat().format(city.population)
      city.rank = i + 1;
      
      if (city.rank === 1) city.rankFormatted = '1st'
      else if (city.rank === 2) city.rankFormatted = '2nd'
      else if (city.rank === 3) city.rankFormatted = '3rd'
      else city.rankFormatted = `${city.rank}th`
    }
    setHighlight = props.city.setHighlight
    highlightAllCities = new Array(cities.length).fill().map((_, i) => i)
    for (const { name, mixName } of mapSpecs) {
      const map = getMap(name)
      const draw = getDrawCmds(name)
      spreadProps({ map, draw, props, mixName })
    }
    emitter.emit('draws-ready')
  })
  .catch((error) => {
    console.log(error)
  })

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
  })

  emitter.on('draws-ready', () => {
    emitter.emit('render')
    let nightMapTick = getTick('nightMap')

    frame()

    const mapFadingInProgress = trackProgress('map-fading-in', (t) => {
      const tick = lerp(state.mapFadingIn.tickRange[0], state.mapFadingIn.tickRange[1], t)
      state.mapFadingIn.tick = tick
    })

    setHighlight(highlightAllCities, { tick: nightMapTick() })
    const nightMapCycle = trackProgress('night-map', (t, bbox) => {
      const hasSelected = !!state.nightMap.selectedCity
      if (bbox.section.top < 10 && ((Math.abs(bbox.section.top) + bbox.map.height) < bbox.section.height)) {
        const index = Math.floor(t * cities.length)
        setHighlight([index], { tick: nightMapTick() })
        state.nightMap.selectedCity = Object.assign({ index }, cities[index])  
        emitter.emit('render')
      }
      else if (hasSelected) {
        setHighlight(highlightAllCities, { tick: nightMapTick() })
        state.nightMap.selectedCity = null
        emitter.emit('render')
      }
    })

    mapFadingInProgress.scroll()
    window.addEventListener('scroll', () => {
      mapFadingInProgress.scroll()
      nightMapCycle.scroll()
    })

    window.addEventListener('click', (event) => {
      getMap('nightMap').pick(event, (err, picked) => {
        if (err || picked[3] < 1) {
          state.nightMap.selectedCity = null
        }
        else {
          const index = pickUnpack(picked)
          const feature = cities[index]
          console.log(feature.city)
        }
      })
    })
  })

  function frame () {
    setLightPosictionTick('mapCycle', state.mapCycle)
    setLightPosictionTick('mapFadingIn', state.mapFadingIn)
    // drawing any map will re-draw all of them that are already
    // on screen based on mixmap > regl-component/multi
    mapPerMix.forEach(({ map }) => {
      map.draw()
    })
    state.mapCycle.tick += 1

    if (state.mapCycle.playing) window.requestAnimationFrame(frame)
  }
}

app.route('/', mapScroll2)
app.route('/*', mapScroll2)

app.use(mapScroll2Store)

app.mount('body')

// i want to have functions that listen for scroll and resizing
// scroll:
// 1. get the current scroll top of the map element
// 2. see where that scroll top is in comparision to the max travel distance
// - max travel distance:
// -- section height
// -- section top
function trackProgress (id, onProgress) {
  const sectionEl = document.getElementById(id)
  const mapEl = sectionEl.querySelector('.map')

  const resize = () => {
    
  }

  const scroll = () => {
    const sectionBbox = sectionEl.getBoundingClientRect()
    const mapBbox = mapEl.getBoundingClientRect()
    const maxTravelDistance = sectionBbox.height - mapBbox.height
    const travelDistance = mapBbox.top - sectionBbox.top
    const clampedTravelDistance = Math.max(Math.min(travelDistance, maxTravelDistance), 0.0)
    const travelPercent = clampedTravelDistance/maxTravelDistance
    onProgress(travelPercent, { section: sectionBbox, map: mapBbox })
  }

  return {
    resize,
    scroll,
  }
}