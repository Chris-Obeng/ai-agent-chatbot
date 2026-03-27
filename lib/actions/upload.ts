"use server";

import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

export async function uploadFileAction(formData: FormData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const file = formData.get("file") as File;
  const chatId = formData.get("chatId") as string;
  if (!file) {
    throw new Error("No file provided");
  }

  // Ensure user exists in our DB
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: "user-" + userId + "@lumina.ai", // Placeholder email as Clerk doesn't always provide it in claims without config
    },
  });

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer]);

  let text = "";
  if (file.type === "application/pdf") {
    const loader = new PDFLoader(blob);
    const docs = await loader.load();
    text = docs.map((doc) => doc.pageContent).join("\n");
  } else {
    text = await file.text();
  }

  const document = await prisma.document.create({
    data: {
      chatId,
      filename: file.name,
      content: text,
    },
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitText(text);

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  for (const chunk of chunks) {
    const vector = await embeddings.embedQuery(chunk);

    // Prisma doesn't support vector types directly in create/upsert yet for pgvector
    // unless using Unsupported, so we use executeRaw for the embedding
    const createdChunk = await prisma.chunk.create({
      data: {
        documentId: document.id,
        content: chunk,
      },
    });

    await prisma.$executeRaw`
      UPDATE "Chunk"
      SET "embedding" = ${vector}::vector
      WHERE "id" = ${createdChunk.id}
    `;
  }

  return { success: true, documentId: document.id };
}
