import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { SignUp } from '@clerk/nextjs';
import { useUser } from "@clerk/clerk-react";

export default async function Home() {
  const { userId } = await auth();


  if (userId) {
    console.log(userId);
    redirect('/dashboard');
  }

  return (
    <div className='flex justify-center items-center h-screen'>
      <SignUp routing="hash" />
    </div>
  );
}