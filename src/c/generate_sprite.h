#include <libavformat/avformat.h>

typedef struct {
    uint8_t *ptr;
    size_t size;
} buffer_data;

typedef struct {
    uint8_t *data;
    size_t size;
} SpriteImage;

int generateSprite(AVFormatContext *av_fmt_ctx, SpriteImage *spriteImage);

