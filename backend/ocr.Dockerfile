FROM public.ecr.aws/lambda/nodejs:18
RUN yum update -y && \
    yum install -y tesseract tesseract-langpack-spa && \
    yum clean all
COPY package*.json ./
RUN npm install
COPY dist/ocrHandler.js ./
CMD ["ocrHandler.handler"]
