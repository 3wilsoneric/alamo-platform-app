export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-10 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.24em] text-emerald-400">Alamo Platform</p>
        <h1 className="mt-4 text-4xl font-bold">Microsoft sign-in goes here.</h1>
        <p className="mt-4 text-slate-300 leading-7">
          Replace this placeholder with Microsoft Entra ID authentication, then route
          authenticated users into the DataHub app shell.
        </p>
      </div>
    </main>
  );
}
