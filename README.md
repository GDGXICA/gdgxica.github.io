# Google Developer Group (GDG) ICA 2025 - Sitio Web Oficial

![gdg cover image](preview.png)

[🖼️ Diseño en Figma](https://www.figma.com/design/OsE9m2hnvt7DjuI7e7Ocx3/GDG-ICA?node-id=0-1&t=XAHKhrJY81pkcRk6-1)

## 🚀 Sobre el Proyecto

Este proyecto es una iniciativa del equipo de desarrollo para crear el sitio web oficial del Google Developer Group (GDG) ICA. La web está construida utilizando tecnologías modernas.

### 📝 Licencia del Proyecto

Este proyecto está bajo la Licencia MIT, lo que permite su uso, modificación y distribución con fines personales o comerciales.
Las contribuciones son bienvenidas. Si querés proponer mejoras, hacelo a través de un Pull Request (PR).

Consulta los términos completos en el archivo [LICENSE.md](LICENSE.md).

### 🛠️ Tecnologías

- [Astro 5](https://astro.build)
- [TailwindCSS 4](https://tailwindcss.com)

## ⚠️ Requerimientos

- Git
- Node 22.15.0
- PNPM 10.11.0

## 🔧 Instalación

Instala las dependencias

```sh
pnpm install
```

Inicia el proyecto en modo desarrollo

```sh
pnpm run dev
```

## 🚀 Estructura del proyecto

Dentro del proyecto, tu verás las siguientes carpetas y archivos:

```plaintext
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

## 🧞 Comandos

Todos los comandos se ejecutan desde la raíz del proyecto, desde una terminal:

| Comando          | Acción                                          |
| :--------------- | :---------------------------------------------- |
| `pnpm install`   | Instalar dependencias                           |
| `pnpm dev`       | Iniciar un servidor local `localhost:4321`      |
| `pnpm build`     | Construir tu sitio para producción `./dist/`    |
| `pnpm preview`   | Vista previa de su compilación                  |
| `pnpm astro ...` | Ejecute comandos CLI `astro add`, `astro check` |

## 🤝 Cómo Contribuir

1. Clona el proyecto en tu local
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Haz commit de tus cambios (`git commit -m 'Add: AmazingFeature'`)
4. Haz Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

> Nota: antes de codificar una nueva funcionalidad ve a la sección de issues y PRs del repositorio y verifica que ya no se esté discutiendo sobre ese tema, o que ya otra persona no lo haya relizado.

### 📋 Estándares de Código

#### Commits

Si es posible describe tus commits para que los mantenedores los puedan analizar de una forma más rápida y eficiente.

- `feat:` - Nuevas características
- `fix:` - Correcciones de bugs
- `docs:` - Cambios en documentación
- `style:` - Cambios que no afectan el código (espacios, formato, etc)
- `refactor:` - Refactorización del código
- `test:` - Añadir o modificar tests
- `chore:` - Cambios en el proceso de build o herramientas auxiliares

Ejemplo: `feat: add newsletter subscription component`

#### Código

- Utiliza en lo posible el estilo de codificación configurado
- Nombra las variables y funciones en camelCase
- Utiliza nombres descriptivos en variables y funciones
- Los componentes de Astro deben ir en PascalCase
- Comenta tu código cuando solo sea necesario

#### CSS/TailwindCSS

- Utiliza las clases de Tailwind siempre que sea posible
- Evita CSS personalizado a menos que sea absolutamente necesario

#### Pull Requests

- Describe claramente los cambios realizados
- Incluye capturas de pantalla si hay cambios visuales
- Referencia los issues relacionados si los hay
- Mantén los PR pequeños y enfocados en una sola característica

### Formas de contribuir

- Todos los aportes son importantes
- Codificación
- Pruebas manuales o automatizadas
- Traducciones, correcciones ortográficas

### 🚫 Qué evitar

- No hagas commit directamente a `main`
- No uses `!important` en CSS
- No dejes console.logs en el código
- No añadas dependencias sin discutirlo primero
- No modifiques la configuración del proyecto sin consenso
- Evita ser grosero o imponerte en las discusiones

### 👥 Proceso de Review

1. Los PR necesitan al menos una aprobación
2. Atiende los comentarios del review
