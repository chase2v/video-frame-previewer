import {
  fetchRangeData,
  fetchMP4Root,
  extractChildren,
  toDigitFromUint8Array
} from '../utils.js'
import MediaTrack from '../js-parser/MediaTrack.js'

if (Module) {
  init()
} else {
  Module.onRuntimeInitialized = () => {
    console.log('Module inited!')
    init()
  }
}

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
    console.log('dragstart')
    // set drag image
    var img = new Image();
    img.src = '';
    e.dataTransfer.setDragImage(img, 10, 10);

    // log start pos
    startPos = e.screenX
  })
  document.addEventListener('drag', (e) => {
    // console.log('drag')

    const curPos = e.screenX
    pivot.style.transform = `translateX(${curPos - startPos}px)`

    // update ts
    const curPercent = curPos / window.innerWidth
    const currentTime = updatePivotTimestamp(curPercent)
    moveGallery(curPercent)
    prepareGetPreview(curPercent, currentTime)
  })
  document.addEventListener('dragend', (e) => {
    console.log('dragend')
    const curPos = e.screenX
    pivot.style.transform = `translateX(0px)`
    left += curPos - startPos
    pivot.style.left = `${left}px`
    startPos = 0
  })

  // 添加预览图
  for (let count = 30;count > 0; count--) {
    const showcase = document.createElement('div')
    showcase.className = 'preview-showcase'
    // showcase.style.visibility = 'hidden'
    showcase.innerHTML = `
      <div class="preview-showcase__loading">
        loading..
      </div>
    `

    document.querySelector('.preview-gallery')
      .appendChild(showcase)
  }
}

const mp4 = { inited: false }
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
      } = mp4.movieTrack.metadata
      mp4.width = width
      mp4.height = height

      mp4.inited = true
    })
}

function updatePivotTimestamp(percent) {
  const duration = 600
  const currentTime = duration * percent >> 0
  const formattedCurrentTime = getFormattedTime(currentTime)
  document.querySelector('.preview-pivot__current')
    .innerHTML = formattedCurrentTime

  return currentTime
}

function getFormattedTime(seconds) {
  return `${seconds / 60 >> 0}:${seconds % 60 >> 0}`
}

const showcaseWidth = 268 // 预览图节点宽度
const count = 30 // 预览图总张数
const galleryWidth = showcaseWidth * count
const totalDistance = galleryWidth - window.innerWidth
function moveGallery(percent) {
  document.querySelector('.preview-gallery')
    .style.left = `-${percent * totalDistance}px`
}

function initSettings() {
  const form = { mode: 'realtime', source: 'url' }

  document.querySelector('.setting-value--mode').querySelectorAll('.radio')
    .forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) form.mode = e.target.value

        let newValue = 'none'
        if (form.mode === 'sprite') {
          newValue = 'block'

          if (form.source === 'url') {
            document.querySelector('#url').parentElement.style.display = 'block'
            document.querySelector('#file').parentElement.style.display = 'none'

            document.querySelector('.setting-name--url').style.display = 'block'
            document.querySelector('.setting-name--file').style.display = 'none'
          } else {
            document.querySelector('#url').parentElement.style.display = 'none'
            document.querySelector('#file').parentElement.style.display = 'block'

            document.querySelector('.setting-name--url').style.display = 'none'
            document.querySelector('.setting-name--file').style.display = 'block'
          }
        } else {
          newValue = 'none'

          form.source = 'url'
          document.querySelector('.setting-value--source').querySelectorAll('.radio')
            .forEach(radio => {
              if (radio.value === 'url') radio.checked = true
            })
          document.querySelector('#url').parentElement.style.display = 'block'
          document.querySelector('#file').parentElement.style.display = 'none'

          document.querySelector('.setting-name--url').style.display = 'block'
          document.querySelector('.setting-name--file').style.display = 'none'
        }

        document.querySelector('.setting-name--cols').style.display = newValue
        document.querySelector('.setting-name--interval').style.display = newValue
        document.querySelector('.setting-name--source').style.display = newValue

        document.querySelector('#cols').parentElement.style.display = newValue
        document.querySelector('#interval').parentElement.style.display = newValue
        document.querySelector('.setting-value--source').style.display = newValue
      })
    })

  document.querySelector('.setting-value--source').querySelectorAll('.radio')
    .forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) form.source = e.target.value

        if (form.source === 'url') {
          document.querySelector('#url').parentElement.style.display = 'block'
          document.querySelector('#file').parentElement.style.display = 'none'

          document.querySelector('.setting-name--url').style.display = 'block'
          document.querySelector('.setting-name--file').style.display = 'none'
        } else {
          document.querySelector('#url').parentElement.style.display = 'none'
          document.querySelector('#file').parentElement.style.display = 'block'

          document.querySelector('.setting-name--url').style.display = 'none'
          document.querySelector('.setting-name--file').style.display = 'block'
        }
      })
    })

  document.querySelector('#save')
    .addEventListener('click', e => {
      e.preventDefault()

      // 获取所有设置项值
      document.querySelectorAll('.setting-value')
        .forEach(elem => {
          const item = elem.children[0]

          if (item && item.value) {
            form[item.id] = item.value
          }
        })

      console.log(form)

      if (form.url) {
        document.querySelector('video')
          .src = form.url
        initMP4(form.url)
      }
    })
}

let timer = 0
let lastIndex
function prepareGetPreview(percent, seconds) {
  const count = 30
  const currentIndex = count * percent >> 0
  if (currentIndex === lastIndex) return

  clearTimeout(timer)
  lastIndex = currentIndex

  timer = setTimeout(() => {
    getSampleData(seconds)
      .then(parseSample)
      .then(([imageRawData, width, height]) => drawImage('#canvas', width, height, imageRawData))
      .then((url) => {
        const img = new Image()
        img.src = url
        img.style.width = '100%'
        img.style.height = '100%'
        const pic = document.querySelectorAll('.preview-showcase')[lastIndex]
        pic.replaceChild(img, pic.children[0])
      })
    console.log('It is time to get preview image', currentIndex, seconds)
  }, 1500)
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

function drawImage(id, width, height, buffer) {
  let memCanvas = document.createElement('canvas')
  let memContext = memCanvas.getContext('2d')
  let canvas = document.createElement('canvas')
  let ctx = canvas.getContext('2d')
  canvas.width = 320

  let imageData = ctx.createImageData(width, height);
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
  canvas.height = canvas.width * height / width;
  memContext.putImageData(imageData, 0, 0, 0, 0, width, height);
  ctx.drawImage(memCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL()
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

function getFileData(file) {
  if (!file) return Promise.reject('no file')

  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    fileReader.onloadend = (e) => {
      resolve(new DataView(e.target.result))
    }
    fileReader.readAsArrayBuffer(file)
  })
}

function generateSprite(data, cols = 5, interval = 10) {
  const getSpriteImage = Module.cwrap('getSpriteImage', 'number',
                  ['number', 'number', 'number', 'number']);
  const uint8Data = new Uint8Array(data.buffer)
  const offset = Module._malloc(uint8Data.length)
  Module.HEAPU8.set(uint8Data, offset)
  const ptr = getSpriteImage(offset, uint8Data.length, cols, interval)

  const spriteData = Module.HEAPU32[ptr / 4]
  const size = Module.HEAPU32[ptr / 4 + 1]
  const width = Module.HEAPU32[ptr / 4 + 2]
  const height = Module.HEAPU32[ptr / 4 + 3]
  const rows = Module.HEAPU32[ptr / 4 + 4]
  const spriteRawData = Module.HEAPU8.slice(spriteData, spriteData + size)

  Module._free(offset)
  Module._free(ptr)
  Module._free(spriteData)

  return [spriteRawData, width, height, rows]
}
