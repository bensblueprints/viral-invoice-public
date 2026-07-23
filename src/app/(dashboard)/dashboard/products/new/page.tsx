import { createProduct } from "../../../actions";
import { ProductForm } from "../ProductForm";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New product</h1>
      <ProductForm action={createProduct} />
    </div>
  );
}
