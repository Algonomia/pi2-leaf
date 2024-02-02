FROM nvidia/cuda:11.2.2-devel-ubuntu18.04 as compile

RUN mkdir app
WORKDIR /app

RUN apt update
RUN apt install -y cmake

ADD CudaProject .

RUN cmake -B /app/cmake-build-release -S /app -DCMAKE_BUILD_TYPE=Release -G "CodeBlocks - Unix Makefiles" /app
RUN cmake --build /app --target CudaProject -- -j 4
RUN mkdir CudaProjectlibs
RUN ldd CudaProject | grep "=> /" | awk '{print $3}' | xargs -I '{}' cp -v '{}' CudaProjectlibs

FROM node:16
RUN apt update
RUN apt install -y libc6
WORKDIR /usr/src/app
COPY . ./
RUN npm install
RUN ./node_modules/typescript/bin/tsc
COPY --from=compile /app/CudaProject ./detentionComputation
RUN mkdir CudaProjectlibs
COPY --from=compile /app/CudaProjectlibs ./CudaProjectlibs
RUN chmod +x detentionComputation

EXPOSE 3000
CMD [ "node", "dist/index.js" ]
