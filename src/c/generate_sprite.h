#include <libavformat/avformat.h>

typedef struct {
    uint8_t *ptr;
    size_t size;
    size_t totalSize;
    size_t pos;
} buffer_data;

typedef struct {
    uint8_t *data;
    size_t size;
    size_t width;
    size_t height;
    size_t rows;
    size_t count;
} SpriteImage;

int generateSprite(AVFormatContext *av_fmt_ctx, SpriteImage *spriteImage, int interval, int cols);

