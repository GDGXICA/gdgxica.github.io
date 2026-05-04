# Guía de Contribución

¡Gracias por tu interés en contribuir al sitio web de GDG ICA! Esta guía explica cómo participar en el proyecto.

## Antes de empezar

- Lee el [Código de Conducta](CODE_OF_CONDUCT.md).
- Revisa los [issues abiertos](https://github.com/GDGXICA/gdgxica.github.io/issues) para ver si alguien ya está trabajando en lo que quieres hacer.
- Para cambios grandes, abre un issue primero para discutir el enfoque antes de invertir tiempo en código.
- Consulta con el equipo antes de agregar nuevas dependencias.

## Flujo de trabajo

1. Haz un fork del repositorio y crea tu rama desde `main`.
2. Nombra tu rama siguiendo la convención:
   - `feature/NombreFeature` para nuevas funcionalidades
   - `fix/NombreBug` para correcciones
   - `docs/NombreDoc` para documentación
3. Realiza tus cambios y verifica que el proyecto compila sin errores (`pnpm build`).
4. Asegúrate de que el linter pasa (`pnpm lint`).
5. Haz commit usando el formato convencional (ver abajo).
6. Abre un Pull Request hacia `main` con una descripción clara de los cambios.

## Formato de commits

Usa el prefijo adecuado:

```
feat:     nueva funcionalidad
fix:      corrección de bug
docs:     cambios en documentación
style:    cambios de formato (sin lógica)
refactor: refactorización de código
test:     adición o corrección de tests
chore:    tareas de mantenimiento
```

Ejemplo: `feat: agregar sección de sponsors en homepage`

## Reglas de código

- Sin `console.log` en código de producción.
- Sin `!important` en CSS; usa utilidades de Tailwind.
- Componentes `.astro` para contenido estático; React (`.jsx`/`.tsx`) solo para interactividad en el cliente.
- El contenido del sitio está en español.

## Configuración local

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo
pnpm dev

# Build de producción
pnpm build
```

## ¿Tienes preguntas?

Abre un issue o contáctanos en **gdgica1@gmail.com**.
