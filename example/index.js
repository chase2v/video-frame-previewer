import {
  fetchRangeData,
  fetchMP4Root,
  extractChildren,
  toDigitFromUint8Array
} from '../src/utils.js'
import MediaTrack from '../src/js-parser/MediaTrack.js'

if (Module) {
  init()
} else {
  Module.onRuntimeInitialized = () => {
    console.log('Module inited!')
    init()
  }
}

let settings = { mode: 'realtime', source: 'url' }
let count = 0 // 预览图总张数
const mp4 = { inited: false }
const showcasePadding = 12
let showcaseWidth = 268 // 预览图节点宽度
const showcaseHeight = 144 // 预览图节点高度

function init() {
  initPreviewer()
  initSettings()
}

function initPreviewer() {
  let startPos = 0
  let left = 0
  const pivot = document.querySelector('.preview-pivot')

  document.addEventListener('dragover', (e) => {
    e.preventDefault()

    e.dataTransfer.dropEffect = "move"
  });
  document.addEventListener('drop', (e) => e.preventDefault());
  document.addEventListener('dragstart', (e) => {
    // set drag image
    var img = new Image();
    img.src = '';
    e.dataTransfer.setDragImage(img, 10, 10);

    // log start pos
    startPos = e.screenX
  })
  document.addEventListener('drag', (e) => {
    const curPos = e.screenX
    pivot.style.transform = `translateX(${curPos - startPos}px)`

    // update ts
    const curPercent = curPos / window.innerWidth
    const currentTime = updatePivotTimestamp(curPercent)
    moveGallery(curPercent)
  })
  document.addEventListener('dragend', (e) => {
    const curPos = e.screenX
    pivot.style.transform = `translateX(0px)`
    left += curPos - startPos
    pivot.style.left = `${left}px`
    startPos = 0

    const curPercent = curPos / window.innerWidth
    const currentTime = updatePivotTimestamp(curPercent)
    moveGallery(curPercent)
    if (settings.mode === 'realtime') getPreview(curPercent, currentTime)
  })
}

function initSettings() {
  const form = { mode: 'realtime', source: 'url' }

  document.querySelector('#save')
    .addEventListener('click', e => {
      e.preventDefault()

      // 获取所有设置项值
      document.querySelectorAll('.setting-value')
        .forEach(elem => {
          const item = elem.children[0]

          if (item.id === 'file') {
            form.file = item.files[0]
          } else if (item && item.value) {
            form[item.id] = item.value
          }
        })

      if (form.url) {
        document.querySelector('video')
          .src = form.url
        initMP4(form.url)
      }

      settings = form
    })
}

function initMP4(url = '') {
  if (!url) return

  mp4.url = url
  fetchMP4Root(url)
    .then((boxes) => {
      let movieTrack
      boxes.forEach(box => {
        if (box.type === 'moov') {
          const moovBox = parseMoov(box.originData)
          const tracks = moovBox.children
            .filter(child => child.type === 'trak')
            .map(trakBox => new MediaTrack(trakBox))
          mp4.movieTrack = tracks[0]
          console.log('解析出的视频 trak box 为：', mp4.movieTrack)
        }
      })

      mp4.sps = mp4.movieTrack.getSPS()
      mp4.pps = mp4.movieTrack.getPPS()
      mp4.spsUint8 = Uint8Array.from(mp4.sps.NALUnit)
      mp4.ppsUint8 = Uint8Array.from(mp4.pps.NALUnit)

      const {
        width,
        height,
        duration: _duration,
        timescale
      } = mp4.movieTrack.metadata
      mp4.width = width
      mp4.height = height

      mp4.keyframes = mp4.movieTrack.syncTable.length
      addShowcases(mp4.keyframes, mp4.width * showcaseHeight / mp4.height)

      mp4.duration = _duration / timescale
      document.querySelector('.preview-track__duration')
        .innerHTML = getFormattedTime(mp4.duration)

      mp4.inited = true
    })
}

// 添加预览图
function addShowcases(_count, width) {
  showcaseWidth = width + showcasePadding
  count = _count

  for (let i = count; i > 0; i--) {
    const showcase = document.createElement('div')
    showcase.className = 'preview-showcase'
    showcase.style.width = `${width}px`
    showcase.innerHTML = `
      <div class="preview-showcase__loading">
        loading..
      </div>
    `

    document.querySelector('.preview-gallery')
      .appendChild(showcase)
  }
}

function updatePivotTimestamp(percent) {
  const currentTime = mp4.duration * percent >> 0
  const formattedCurrentTime = getFormattedTime(currentTime)
  document.querySelector('.preview-pivot__current')
    .innerHTML = formattedCurrentTime

  return currentTime
}

function getFormattedTime(seconds) {
  return `${seconds / 60 >> 0}:${seconds % 60 >> 0}`
}

function moveGallery(percent) {
  const galleryWidth = showcaseWidth * count
  const totalDistance = galleryWidth - window.innerWidth
  document.querySelector('.preview-gallery')
    .style.transform = `translateX(-${percent * totalDistance}px)`
}

let currentIndex
function getPreview(percent, seconds) {
  currentIndex = count * percent >> 0
  getSampleData(seconds)
    .then(parseSample)
    .then(drawImage)
    .then((url) => {
      const img = new Image()
      img.src = url
      img.style.width = '100%'
      img.style.height = '100%'
      const pic = document.querySelectorAll('.preview-showcase')[currentIndex]
      pic.replaceChild(img, pic.children[0])
    })
}

function getSampleData(seconds) {
  if (!mp4.inited) return

  const { url, movieTrack } = mp4
  // const { size, offset } = movieTrack.getSampleSizeAndOffset(seconds, true)
  const sampleDataArr = movieTrack.getSampleDataArr(seconds)

  return Promise.all(sampleDataArr.map(sd => fetchRangeData(url, sd.offset, sd.size)))
    .then(res => {
      return sampleDataArr
        .map((sd, i) => ({ ...sd, data: res[i]}))
        .map((sd, i) => {
          let sampleData = new Uint8Array(sd.data)

          if (i === 0) {
            if (sampleData[4] === 6) {
              const seiSize = toDigitFromUint8Array(sampleData.slice(0, 4))
              const seiData = sampleData.slice(4, seiSize)
              sampleData = sampleData.slice(seiSize + 4)
            }

            sd.uint8Data = new Uint8Array([
              ...[0, 0, 0, 1],
              ...mp4.spsUint8,
              ...[0, 0, 0, 1],
              ...mp4.ppsUint8,
              ...[0, 0, 0, 1],
              ...sampleData.slice(4),
            ])
          } else {
            sd.uint8Data = new Uint8Array([
              ...[0, 0, 0, 1],
              ...sampleData.slice(4),
            ])
          }

          return sd
        })
    })
    .then(res => [res, movieTrack.metadata.width, movieTrack.metadata.height])
}

function parseSample([sampleDataArr, width, height]) {
  const getPreviewData = Module.cwrap('getPreviewData', 'number',
                  ['number', 'number', 'number', 'number']);
  sampleDataArr = sampleDataArr.map(sd => {
    const dataPtr = Module._malloc(sd.uint8Data.length)
    Module.HEAPU8.set(sd.uint8Data, dataPtr)

    return {
      data: dataPtr,
      size: sd.size,
      dts: sd.dts
    }
  })
  const arrPtr = Module._malloc(sampleDataArr.length * 12)
  let uint32SampleDataArr = []
  sampleDataArr.forEach(sd => {
    uint32SampleDataArr.push(sd.data)
    uint32SampleDataArr.push(sd.size)
    uint32SampleDataArr.push(sd.dts)
  })
  uint32SampleDataArr = new Uint32Array(uint32SampleDataArr)
  Module.HEAPU32.set(uint32SampleDataArr, arrPtr / 4)
  const ptr = getPreviewData(arrPtr, sampleDataArr.length, width, height)

  const size = Module.HEAPU32[ptr / 4]
  const frameDataPtr = Module.HEAPU32[ptr / 4 + 1]
  const imageRawData = Module.HEAPU8.subarray(frameDataPtr, frameDataPtr + size)
  return [imageRawData, width, height]
}

function drawImage([buffer, width, height]) {
  let memCanvas = document.createElement('canvas')
  let memContext = memCanvas.getContext('2d')

  let imageData = memContext.createImageData(width, height);
  let k = 0;
  for (let i = 0; i < buffer.length; i++) {
      if (i && i % 3 === 0) {
          imageData.data[k++] = 255;
      }
      imageData.data[k++] = buffer[i];
  }
  imageData.data[k] = 255;
  memCanvas.width = width;
  memCanvas.height = height;
  memContext.putImageData(imageData, 0, 0, 0, 0, width, height);

  return memCanvas.toDataURL()
}

function parseMoov(moovBuffer) {
  const moovInt8 = new Uint8Array(moovBuffer)
  const moovSize = Array.from(moovInt8.slice(0, 4)).map(n => ('00' + n.toString(16)).slice(-2)).join('')

  const moov = {
    type: 'moov',
    size: moovSize,
    data: moovInt8,
  }

  moov.children = extractChildren(moov)
  return moov
}
