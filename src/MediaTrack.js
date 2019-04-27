import {
  toDigitFromUint8Array,
  toTextFromUnit8Array,
  toBitsFromUint8Array,
  decodeUnicode,
} from './utils'

export default class MediaTrack {
  constructor(trakBox) {
    this.size = trakBox.size;
    this.data = trakBox.data;
    this.box = trakBox;

    this.metadata = this._getMetadata(trakBox);

    this.type = this._getType(trakBox)
    this.timeTable = this._parseSTTS(this._getSampleTableBox('stts'))
    this.syncTable = this._parseSTSS(this._getSampleTableBox('stss'))
    this.sizeTable = this._parseSTSZ(this._getSampleTableBox('stsz'))
    this.chunkTable = this._parseSTSC(this._getSampleTableBox('stsc'))
    this.chunkOffsetBox = this._parseSTCO(this._getSampleTableBox('stco'))
  }

  getSampleData(timestamp) {

  }

  _getMetadata() {
    const metadata = {}
    
    const mdhdBox = this.box.children
      .filter(child => child.type === 'mdia')[0].children
      .filter(child => child.type === 'mdhd')[0]
    const mdhdBoxData = mdhdBox.data
    
    const version = mdhdBoxData[8]

    if (version === 1) {
      metadata.creationTime = toDigitFromUint8Array(mdhdBoxData.slice(12, 20))
      metadata.modificationTime = toDigitFromUint8Array(mdhdBoxData.slice(20, 28))
      metadata.timescale = toDigitFromUint8Array(mdhdBoxData.slice(28, 32))
      metadata.duration = toDigitFromUint8Array(mdhdBoxData.slice(32, 40))
      // ISO-639-2/T language code
      metadata.language = toTextFromUnit8Array(mdhdBoxData.slice(40, 42))
    } else {
      metadata.creationTime = toDigitFromUint8Array(mdhdBoxData.slice(12, 16))
      metadata.modificationTime = toDigitFromUint8Array(mdhdBoxData.slice(16, 20))
      metadata.timescale = toDigitFromUint8Array(mdhdBoxData.slice(20, 24))
      metadata.duration = toDigitFromUint8Array(mdhdBoxData.slice(24, 28))
      // ISO-639-2/T language code
      const langcodes = []
      const langCodeBits = toBitsFromUint8Array(mdhdBoxData.slice(28, 30))
      langcodes[0] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(1, 6), 2) + 96).toString(16)).slice(-2))
      langcodes[1] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(6, 11), 2) + 96).toString(16)).slice(-2))
      langcodes[2] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(11, 16), 2) + 96).toString(16)).slice(-2))
      metadata.language = langcodes.join('')
    }

    const getLanguageCode = (version) => {

    }

    return metadata
  }

  _getType(trakBox) {
    return trakBox.children
      .filter(trakChild => trakChild.type === 'mdia')[0].children
      .filter(mdiaChild => mdiaChild.type === 'minf')[0].children
      .some(minfChild => minfChild.type === 'vmhd')
      ? 0 : 1;
  }

  _getSampleTableBox(type) {
    return this.box.children
      .filter(child => child.type === 'mdia')[0].children
      .filter(child => child.type === 'minf')[0].children
      .filter(child => child.type === 'stbl')[0].children
      .filter(child => child.type === type)[0]
  }

  _parseSTTS(sttsBox) {
    const sttsBoxData = sttsBox.data
    const entryCount = toDigitFromUint8Array(sttsBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        sampleCount: toDigitFromUint8Array(sttsBoxData.slice(16, 16 + (i + 1) * 4)),
        sampleDelta: toDigitFromUint8Array(sttsBoxData.slice(16 + (i + 1) * 4, 16 + (i + 1) * 8)),
      })
    }
    return entries
  }

  _parseSTSS(stssBox) {
    if (!stssBox) return
    
    const stssBoxData = stssBox.data
    const entryCount = toDigitFromUint8Array(stssBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        sampleNumber: toDigitFromUint8Array(stssBoxData.slice(16 + 4 * i, 16 + (i + 1) * 4)),
      })
    }
    return entries
  }

  _parseSTSZ(stszBox) {
    const stszBoxData = stszBox.data
    const sampleSize = toDigitFromUint8Array(stszBoxData.slice(12, 16))
    const sampleCount = toDigitFromUint8Array(stszBoxData.slice(16, 20))
    const entries = []
    if (sampleSize === 0) {
      for (let i = 0; i < sampleCount; i++) {
        const entrySize = toDigitFromUint8Array(stszBoxData.slice(20 + 4 * i, 20 + (i + 1) * 4))
        entries.push({
          entrySize,
          offset: i && entries[i - 1].offset + entrySize
        })
      }
    }
    return {
      sampleSize,
      sampleCount,
      entries,
    }
  }

  _parseSTSC(stscBox) {
    const stscBoxData = stscBox.data
    const entryCount = toDigitFromUint8Array(stscBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        firstChunkIndex: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i, 16 + 12 * i + 4)),
        samplesPerChunk: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i + 4, 16 + 12 * i + 8)),
        sampleDescriptionIndex: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i + 8, 16 + 12 * i + 12)),
      })
    }
    return entries
  }

  _parseSTCO(stcoBox) {
    const stcoBoxData = stcoBox.data
    const entryCount = toDigitFromUint8Array(stcoBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        chunkOffset: toDigitFromUint8Array(stcoBoxData.slice(16 + 4 * i, 16 + (i + 1) * 4)),
      })
    }
    return entries
  }
}
