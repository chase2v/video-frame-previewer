#include <emscripten.h>
#include <stdio.h>
#include "preview.h"

#define min(a,b) (((a) < (b)) ? (a) : (b))

int main(int argc, char *argv[])
{
	printf("init success!\n");

	return 0;
}

EMSCRIPTEN_KEEPALIVE
PreviewResult *getPreviewData(SampleData sampleDataArr[], int count, int width, int height)
{
	PreviewResult *pr = decode_sample(sampleDataArr, count, width, height);
	printf("ptr is: %p\n, frame ptr is: %p\n, data size is: %d\n",
			pr,
			pr->frameData,
			pr->size);

	return pr;
}
