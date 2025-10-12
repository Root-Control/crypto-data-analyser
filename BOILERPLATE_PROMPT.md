# Prompt para Crear Boilerplate de NestJS Empresarial

## Instrucciones Generales

Crea un boilerplate completo y profesional de NestJS que sirva como base para aplicaciones empresariales. El proyecto debe seguir las mejores prácticas de desarrollo, incluir todas las herramientas necesarias para un entorno de producción y ser completamente funcional desde el primer momento.

## Especificaciones Técnicas

### Framework y Lenguaje

- **NestJS** como framework principal
- **TypeScript** con configuración estricta
- **Node.js 18+** como runtime
- **ESLint** y **Prettier** para calidad de código
- **Jest** para testing (unit y e2e)

### Base de Datos y Almacenamiento

- **MongoDB** como base de datos principal con Mongoose ODM
- **Redis** para caché y sesiones
- Configuración de conexión robusta con manejo de errores
- Schemas base reutilizables con timestamps automáticos

### Autenticación y Seguridad

- **JWT Authentication** completo con refresh tokens
- **Passport** con estrategias JWT y Local
- **bcryptjs** para hash de contraseñas
- **Guards** personalizados para protección de rutas
- **Helmet** para headers de seguridad
- **CORS** configurado apropiadamente
- **Rate limiting** (opcional)

### Arquitectura y Patrones

- **Arquitectura modular** con separación clara de responsabilidades
- **Generic CRUD Service** reutilizable con TypeScript generics
- **DTOs** con validación usando class-validator
- **Event Emitter** para arquitectura basada en eventos
- **Interceptors** para transformación de respuestas
- **Pipes** para validación y transformación
- **Filters** para manejo global de excepciones

### Documentación y API

- **Swagger/OpenAPI** integrado con decoradores
- **Documentación automática** de todos los endpoints
- **Health check** endpoint
- **Versionado de API** (opcional)

### Infraestructura y DevOps

- **Docker** con Dockerfile optimizado
- **Docker Compose** para desarrollo y producción
- **Kubernetes** manifests (deployment, service, configmap, secrets)
- **Helm Charts** para gestión de paquetes
- **Terraform** para infraestructura como código
- **Makefile** con comandos útiles
- **Scripts de build y deploy**

### Estructura de Directorios Requerida

```
src/
├── common/                    # Utilidades compartidas
│   ├── decorators/           # Decoradores personalizados
│   ├── dtos/                 # DTOs base y paginación
│   ├── filters/              # Filtros globales
│   ├── guards/               # Guards personalizados
│   ├── interceptors/         # Interceptors
│   ├── pipes/                # Pipes personalizados
│   ├── schemas/              # Schemas base de MongoDB
│   └── services/             # Servicios genéricos (CRUD)
├── config/                   # Configuración de la aplicación
├── modules/                  # Módulos de funcionalidad
│   ├── auth/                 # Módulo de autenticación
│   │   ├── controllers/      # Controladores
│   │   ├── dtos/            # DTOs específicos
│   │   ├── guards/          # Guards de auth
│   │   ├── schemas/         # Schemas de usuario
│   │   ├── services/        # Servicios de auth
│   │   └── strategies/      # Estrategias de Passport
│   ├── database/            # Configuración de base de datos
│   ├── health/              # Health checks
│   └── [feature-module]/    # Módulo de ejemplo (ej: articles)
├── third-party-services/     # Servicios externos
│   └── redis/               # Servicio de Redis
├── app.module.ts            # Módulo raíz
└── main.ts                  # Punto de entrada
```

### Módulos Obligatorios

#### 1. Módulo de Autenticación

- Registro de usuarios con validación
- Login con JWT
- Refresh token
- Protección de rutas
- Estrategias Passport (JWT, Local)
- Hash de contraseñas con bcryptjs

#### 2. Módulo de Base de Datos

- Configuración de MongoDB
- Factory pattern para conexiones
- Providers para diferentes entornos
- Manejo de errores de conexión

#### 3. Módulo de Health

- Health check endpoint
- Verificación de servicios externos
- Métricas básicas

#### 4. Módulo de Ejemplo (Articles)

- Implementación completa usando el CRUD genérico
- Controlador con todos los endpoints
- DTOs de validación
- Schema de MongoDB
- Tests unitarios

### Servicio CRUD Genérico

Crear un servicio genérico que incluya:

- `create(createDto)` - Crear documento
- `find(filter, pagination)` - Buscar con filtros y paginación
- `findOne(filter)` - Buscar un documento
- `findById(id)` - Buscar por ID
- `updateById(id, updateDto)` - Actualizar por ID
- `patchById(id, patchDto)` - Actualización parcial
- `deleteById(id)` - Eliminar por ID
- Soporte para paginación automática
- Transformación de DTOs
- Manejo de errores

### Configuración y Variables de Entorno

Archivo `.env.example` con:

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URI=mongodb://localhost:27017/boilerplate

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=3600s

# CORS
CORS_ORIGIN=*

# Swagger
SWAGGER_TITLE=Boilerplate API
SWAGGER_DESCRIPTION=A comprehensive NestJS boilerplate
SWAGGER_VERSION=1.0
SWAGGER_PATH=docs
```

### Docker y Contenedores

#### Dockerfile

- Multi-stage build
- Usuario no-root
- Optimización de capas
- Health check

#### Docker Compose

- Servicios: app, mongodb, redis
- Volúmenes persistentes
- Redes personalizadas
- Variables de entorno

### Kubernetes

#### Manifiestos requeridos:

- `deployment.yaml` - Deployment principal
- `service.yaml` - Service para exposición
- `configmap.yaml` - Configuración
- `secrets.yaml` - Secretos
- `ingress.yaml` - Ingress (opcional)

### Terraform

- Configuración para AWS/GCP/Azure
- Recursos de base de datos
- Recursos de Redis
- Load balancer
- Variables y outputs

### Testing

- **Jest** configurado
- Tests unitarios para servicios
- Tests e2e para endpoints
- Coverage reporting
- Mocks para servicios externos

### Scripts y Automatización

#### Makefile con comandos:

- `make dev` - Desarrollo
- `make build` - Build
- `make test` - Tests
- `make docker-build` - Build Docker
- `make deploy` - Deploy

#### Scripts en `/scripts`:

- `build.sh` - Script de build
- `deploy.sh` - Script de deploy
- `dev.sh` - Script de desarrollo

### Documentación

#### README.md completo con:

- Descripción del proyecto
- Características principales
- Estructura de directorios
- Instrucciones de instalación
- Variables de entorno
- Comandos disponibles
- API documentation
- Ejemplos de uso
- Contribución
- Licencia

### Configuración de Calidad

#### ESLint

- Configuración estricta de TypeScript
- Reglas de NestJS
- Integración con Prettier
- Reglas deshabilitadas: `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unnecessary-assertion`

#### Prettier

- Configuración consistente
- Integración con ESLint

### Características Adicionales

- **Compression** middleware
- **Request logging**
- **Error handling** global
- **Validation pipes** globales
- **Transform interceptors**
- **Event system** con EventEmitter
- **Scheduling** con @nestjs/schedule (opcional)

## Criterios de Aceptación

1. ✅ El proyecto debe compilar sin errores
2. ✅ Todos los tests deben pasar
3. ✅ Docker debe construir y ejecutar correctamente
4. ✅ Swagger debe estar disponible en `/api/docs`
5. ✅ Health check debe responder en `/api/health`
6. ✅ Autenticación debe funcionar completamente
7. ✅ CRUD genérico debe ser reutilizable
8. ✅ Documentación debe ser completa y clara
9. ✅ Código debe seguir las mejores prácticas
10. ✅ Debe estar listo para producción

## Notas Importantes

- Usar nombres descriptivos para variables y funciones
- Incluir comentarios JSDoc para funciones complejas
- Implementar manejo de errores robusto
- Seguir principios SOLID
- Usar inyección de dependencias correctamente
- Implementar logging apropiado
- Considerar performance y escalabilidad
- Incluir ejemplos de uso en la documentación

## Entregables

1. Código fuente completo y funcional
2. Documentación detallada (README.md)
3. Archivos de configuración (Docker, K8s, Terraform)
4. Scripts de automatización
5. Tests completos
6. Archivo de ejemplo de variables de entorno
