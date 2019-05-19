#include <libavformat/avformat.h>

typedef struct PreviewResult {
	int size;
	uint8_t *frameData;
} PreviewResult;

typedef struct {
    uint8_t *data;
    size_t size;
    int dts;
} SampleData;

int scale_frame(struct SwsContext *img_convert_ctx, AVFrame *frame, AVFrame *frameRGB);
int gen_frame_from_pkt(AVCodecContext *avctx, AVFrame *frame, AVPacket *pkt);
PreviewResult *decode_sample(SampleData sampleDataArr[], int count, int width, int height);

