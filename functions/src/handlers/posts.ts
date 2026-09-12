import { Request, Response } from "express";
import { writeAuditLog, triggerRebuildAndLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import {
  postExists,
  publishPost,
  readPost,
  readPostIndex,
  removePost,
} from "../services/publish";
import { decodeImageDataUrl, savePostImage } from "../services/postImages";
import { GITHUB_TOKEN } from "../config";
import type { PostInput } from "../schemas";

/**
 * Posts del foro.
 *
 * Viven en el repo de datos (`posts/index.json` + `posts/{id}.json`) como el
 * resto del contenido público, y no en Firestore: el sitio es estático y lee
 * de ahí en el build. Las IMÁGENES sí van a Cloud Storage —ver
 * `services/postImages.ts`— porque un binario por cada foto engordaría un repo
 * que se clona entero en cada build.
 */

/**
 * Tope de la imagen ya decodificada, alineado con
 * `MAX_POST_IMAGE_DATAURL_CHARS` del esquema: el esquema acota lo que entra
 * por el cable y esto lo que acaba en el bucket.
 */
const MAX_IMAGE_BYTES = 450 * 1024;

/**
 * El listado devuelve el ÍNDICE, sin cuerpos: el panel pinta una tabla, y
 * traerse el markdown de cada post para no enseñarlo sería pagar el contenido
 * entero en cada carga.
 */
export async function listPosts(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { entries } = await readPostIndex(github);
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function getPost(req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const post = await readPost(github, req.params.id as string);
    if (!post) {
      res.status(404).json({ success: false, error: "Post not found" });
      return;
    }
    res.json({ success: true, data: post.data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Campos que pone el servidor, no quien escribe.
 *
 * `published_at` se estampa la primera vez que se guarda con fecha vacía, para
 * que el listado del sitio —que ordena por ella— nunca tenga que inventarse un
 * orden. La autoría sale del token verificado, no del cuerpo: si viniera del
 * cuerpo, cualquiera con `posts:write` podría firmar un post con el nombre de
 * otra persona.
 */
function stamp(
  post: PostInput,
  user: { displayName: string; photoURL: string }
) {
  const now = new Date().toISOString();
  return {
    ...post,
    published_at: post.published_at || now,
    author_name: post.author_name || user.displayName,
    author_photo_url: post.author_photo_url || user.photoURL,
    updated_at: now,
  };
}

export async function createPost(req: Request, res: Response) {
  try {
    const post = req.body as PostInput;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Crear no puede pisar un post existente: el id lo elige quien escribe, y
    // una colisión reescribiría algo ya publicado sin avisar.
    if (await postExists(github, post.id)) {
      res.status(409).json({
        success: false,
        error: `Ya existe un post con el id "${post.id}"`,
      });
      return;
    }

    const stamped = stamp(post, user);
    await publishPost(github, stamped);

    // Un borrador no sale en el sitio, así que reconstruirlo no cambia nada
    // salvo consumir cuota de Actions. Se reconstruye solo al publicar.
    if (stamped.status === "published") triggerRebuildAndLog(github);

    await writeAuditLog(
      {
        action: "post.create",
        performedBy: user.uid,
        targetId: post.id,
        targetType: "post",
        details: { title: post.title, status: stamped.status },
      },
      req
    );

    res.status(201).json({ success: true, data: { id: post.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updatePost(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const existing = await readPost(github, id);
    if (!existing) {
      res.status(404).json({ success: false, error: "Post not found" });
      return;
    }

    // El id manda la ruta, no el cuerpo: si no, renombrar el id en el editor
    // escribiría un post nuevo y dejaría el viejo huérfano en el índice.
    const stamped = stamp({ ...(req.body as PostInput), id }, user);
    await publishPost(github, stamped);

    // También al despublicar: el sitio tiene que dejar de enseñarlo.
    const wasPublished = existing.data.status === "published";
    if (stamped.status === "published" || wasPublished) {
      triggerRebuildAndLog(github);
    }

    await writeAuditLog(
      {
        action: "post.update",
        performedBy: user.uid,
        targetId: id,
        targetType: "post",
        details: {
          title: stamped.title,
          status: stamped.status,
          previousStatus: String(existing.data.status ?? ""),
        },
      },
      req
    );

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deletePost(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Las imágenes que el post usara NO se borran: el markdown puede
    // referenciar cualquier URL, incluida la de otro post, y borrar el objeto
    // dejaría huecos en un post que sigue publicado. Quedan en el bucket como
    // contenido huérfano.
    const removed = await removePost(github, id);
    if (!removed) {
      res.status(404).json({ success: false, error: "Post not found" });
      return;
    }

    // Mismo criterio que al crear y al editar: el sitio nunca enseñó un
    // borrador, así que borrarlo no cambia nada que reconstruir.
    if (removed.status === "published") triggerRebuildAndLog(github);

    await writeAuditLog(
      {
        action: "post.delete",
        performedBy: user.uid,
        targetId: id,
        targetType: "post",
        details: { status: String(removed.status ?? "") },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Sube una imagen para el cuerpo o la portada de un post.
 *
 * Devuelve la URL ya pública: quien escribe la pega en el markdown. No se ata
 * a ningún post porque el editor sube la imagen ANTES de que el post exista, y
 * porque la misma imagen puede reutilizarse en varios.
 */
export async function uploadPostImage(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { dataUrl } = req.body as { dataUrl: string };

    const image = decodeImageDataUrl(dataUrl, MAX_IMAGE_BYTES);
    if (!image) {
      res.status(400).json({
        success: false,
        error:
          "La imagen no es un JPEG, PNG o WebP válido, o pesa más de 450 KB",
      });
      return;
    }

    const stored = await savePostImage(image);

    await writeAuditLog(
      {
        action: "post.image.upload",
        performedBy: user.uid,
        targetId: stored.path,
        targetType: "post_image",
        details: { contentType: image.contentType, bytes: image.buffer.length },
      },
      req
    );

    res.status(201).json({ success: true, data: stored });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
