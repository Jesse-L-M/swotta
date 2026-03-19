import { redirect } from "next/navigation";
import { AuthError } from "@/lib/auth";
import { getCollections } from "../actions";
import { SourceUploadFlow } from "@/components/sources/source-upload-flow";

export default async function UploadPage() {
  const collections = await loadCollections();

  return (
    <SourceUploadFlow
      collections={collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        fileCount: collection.fileCount,
      }))}
    />
  );
}

async function loadCollections() {
  try {
    return await getCollections();
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      redirect("/onboarding");
    }

    throw error;
  }
}
