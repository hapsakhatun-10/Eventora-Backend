import { Request, Response, NextFunction } from "express";
import multer from "multer";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "File is too large. Maximum size is 10MB." });
      return;
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({ message: "Unexpected file field." });
      return;
    }
    res.status(400).json({ message: err.message });
    return;
  }
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
}
