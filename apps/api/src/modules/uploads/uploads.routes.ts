import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { badRequest } from "../../utils/AppError.js";
import { cloudinary, cloudinaryConfigured } from "../../config/cloudinary.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function uploadBuffer(buffer: Buffer, folder: string, resourceType: "image" | "raw"): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `yummix/${folder}`, resource_type: resourceType },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

// Single endpoint reused across apps (product photos, restaurant logos,
// courier documents) — `folder` groups uploads in Cloudinary for cleanup.
// Images are always normalized to WebP and capped at 1600px wide before
// upload, per the "otimização automática" requirement; non-image files
// (e.g. a PDF ID document) pass through untouched.
uploadsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!cloudinaryConfigured) throw badRequest("Uploads are not configured in this environment", "UPLOADS_DISABLED");
    if (!req.file) throw badRequest("No file provided");

    const folder = typeof req.body.folder === "string" ? req.body.folder.replace(/[^a-z0-9-]/gi, "") || "misc" : "misc";
    const isImage = req.file.mimetype.startsWith("image/");

    const buffer = isImage
      ? await sharp(req.file.buffer).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
      : req.file.buffer;

    const result = await uploadBuffer(buffer, folder, isImage ? "image" : "raw");
    res.status(201).json({ success: true, ...result });
  }),
);
