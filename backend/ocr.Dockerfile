FROM public.ecr.aws/lambda/nodejs:18

# 1. Crear el repositorio EPEL histórico manualmente desde cero
RUN echo "[epel-archive]" > /etc/yum.repos.d/epel-archive.repo && \
    echo "name=EPEL 7 Archive" >> /etc/yum.repos.d/epel-archive.repo && \
    echo "baseurl=https://archives.fedoraproject.org/pub/archive/epel/7/x86_64/" >> /etc/yum.repos.d/epel-archive.repo && \
    echo "enabled=1" >> /etc/yum.repos.d/epel-archive.repo && \
    echo "gpgcheck=0" >> /etc/yum.repos.d/epel-archive.repo

# 2. Actualizar e instalar Tesseract con el paquete de idioma español
RUN yum update -y && \
    yum install -y tesseract tesseract-langpack-spa && \
    yum clean all

# 3. Copiar configuración e instalar dependencias de Node
COPY package*.json ./
RUN npm install

# 4. Copiar el código compilado de la Lambda
COPY dist/ocrHandler.js ./

# 5. Configurar el punto de entrada
CMD ["ocrHandler.handler"]