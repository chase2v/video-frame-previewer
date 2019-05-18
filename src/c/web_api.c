#include <emscripten.h>
#include <stdio.h>
#include <libavformat/avformat.h>
#include <libavformat/avio.h>
#include <libavutil/file.h>
#include "preview.h"
#include "generate_sprite.h"

#define min(a,b) (((a) < (b)) ? (a) : (b))

int main(int argc, char *argv[])
{
	printf("init success!\n");

	return 0;
}

EMSCRIPTEN_KEEPALIVE
PreviewResult *getPreviewData(uint8_t *sampleData, int sampleLength, int width, int height)
{
	PreviewResult *pr = decode_sample(sampleData, sampleLength, width, height);
	printf("ptr is: %p\n, frame ptr is: %p\n, data size is: %d\n",
			pr,
			pr->frameData,
			pr->size);

	return pr;
}

static int read_packet(void *opaque, uint8_t *buf, int buf_size)
{
    buffer_data *bd = (struct buffer_data *)opaque;
    int len = buf_size;
    if (bd->pos + buf_size > bd->totalSize)
        len = bd->totalSize - bd->pos;

    if (!buf_size)
        return AVERROR_EOF;

    /* copy internal buffer data to buf */
    memcpy(buf, bd->ptr + bd->pos, len);
    bd->pos  += len;
    bd->size -= len;

    return len;
}

static int64_t my_seek(void *opaque, int64_t offset, int whence)
{
    printf("offset is: %lld, whence is: %d\n", offset, whence);
    buffer_data *bd = (struct buffer_data *)opaque;
    int64_t new_pos = 0; // 可以为负数
    int64_t fake_pos = 0;

    switch (whence)
    {
        case SEEK_SET:
            new_pos = offset;
            break;
        case SEEK_CUR:
            new_pos = bd->pos + offset;
            break;
        case SEEK_END: // 此处可能有问题
            new_pos = bd->totalSize + offset;
            break;
        default:
            return -1;
    }

    fake_pos = min(new_pos, bd->totalSize);
    if (fake_pos != bd->pos)
    {
        bd->pos = fake_pos;
    }
    //debug("seek pos: %d(%d)\n", offset, op->pos);
    return new_pos;
}

EMSCRIPTEN_KEEPALIVE
SpriteImage *getSpriteImage(uint8_t *buffer, const int buff_size, int cols, int interval)
{
    int ret;
    SpriteImage rt = {0 };
    AVFormatContext *fmt_ctx = NULL;
    AVIOContext *avio_ctx = NULL;
    uint8_t *avio_ctx_buffer = NULL;
    size_t avio_ctx_buffer_size = 32768;
    buffer_data bd = { 0 };

    /* fill opaque structure used by the AVIOContext read callback */
    bd.ptr  = buffer;
    bd.size = buff_size;
    bd.totalSize = buff_size;
    bd.pos = 0;

    if (!(fmt_ctx = avformat_alloc_context())) {
        ret = AVERROR(ENOMEM);
        goto end;
    }

    avio_ctx_buffer = av_malloc(avio_ctx_buffer_size);
    if (!avio_ctx_buffer) {
        ret = AVERROR(ENOMEM);
        goto end;
    }
    avio_ctx = avio_alloc_context(avio_ctx_buffer, avio_ctx_buffer_size,
                                  0, &bd, &read_packet, NULL, &my_seek);
    if (!avio_ctx) {
        ret = AVERROR(ENOMEM);
        goto end;
    }
    fmt_ctx->pb = avio_ctx;

    generateSprite(fmt_ctx, &rt, interval, cols);

end:
    avformat_close_input(&fmt_ctx);

    /* note: the internal buffer could have changed, and be != avio_ctx_buffer */
    if (avio_ctx)
        av_freep(&avio_ctx->buffer);
    avio_context_free(&avio_ctx);

    return &rt;
}

