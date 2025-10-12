#!/bin/bash

# Script para limpiar logs antiguos
echo "🧹 Limpiando logs antiguos..."

# Crear directorio si no existe
mkdir -p logs

# Limpiar logs más antiguos de 7 días
find logs -name "*.log" -type f -mtime +7 -delete

# Comprimir logs más antiguos de 1 día
find logs -name "*.log" -type f -mtime +1 -exec gzip {} \;

echo "✅ Logs limpiados y comprimidos"
echo "📁 Archivos en logs/:"
ls -la logs/
