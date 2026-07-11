export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-signal-blue text-2xl font-bold text-white">
            S
          </div>
          <h1 className="text-xl font-semibold text-foreground">Signal Clone</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
