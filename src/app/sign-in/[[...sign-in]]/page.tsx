import { SignIn } from "@clerk/nextjs"
import { Loader2Icon } from "lucide-react"
import { Suspense } from "react"

export default function SignInPage() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Suspense fallback={<Loader2Icon className="animate-spin size-10" />}>
        <SignIn />
      </Suspense>
    </div>
  )
}
