import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getProduct } from "@/lib/data";
import { updateProduct, deleteProduct } from "../../../actions";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const product = await getProduct(userId, id);
  if (!product) notFound();

  const action = updateProduct.bind(null, id);
  const remove = deleteProduct.bind(null, id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit product</h1>
        <form action={remove}>
          <button type="submit" className="btn-ghost text-red-500 text-sm">
            Delete
          </button>
        </form>
      </div>
      <ProductForm product={product} action={action} />
    </div>
  );
}
