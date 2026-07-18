"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/specialists"); }, [router]);
  return null;
}