"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// This page is a client component — fetch data on mount
export default function MessagesPage() {
  // We can't call server-side auth here, so we rely on the cookie
  // The API will reject if unauthenticated
  return <MessagesView />;
}

function MessagesView() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [messages,  setMessages]  = useState<any[]>([]);
  const [orgInfo,   setOrgInfo]   = useState<any>(null);
  const [customer,  setCustomer]  = useState<any>(null);
  const [body,      setBody]      = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/portal/me?slug=${slug}`).then(r => r.json()).then(d => {
      setOrgInfo(d.organization);
      setCustomer(d.customer);
    });
    fetchMessages();
  }, [slug]);

  const fetchMessages = () => {
    fetch(`/api/portal/messages?slug=${slug}`).then(r => r.json()).then(d => {
      setMessages(d.messages ?? []);
      setIsLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  };

  const handleSend = async () => {
    if (!body.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, body: body.trim() }),
      });
      if (res.ok) {
        setBody("");
        fetchMessages();
      }
    } finally {
      setIsSending(false);
    }
  };

  if (!orgInfo) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <PortalLayout slug={slug} customerName={customer ? `${customer.firstName} ${customer.lastName}` : ""}
      orgName={orgInfo.name} orgLogo={orgInfo.logoUrl}
      allowBooking={orgInfo.portalAllowBooking} allowChat={orgInfo.portalAllowChat} allowPhotos={orgInfo.portalAllowPhotoUpload}>

      <div className="flex flex-col h-screen md:h-[calc(100vh-0px)] max-w-2xl mx-auto">
        <div className="px-5 py-4 border-b border-slate-100 bg-white flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div>
            <h1 className="font-semibold text-slate-900">Messages</h1>
            <p className="text-xs text-slate-400">Chat with {orgInfo.name}</p>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Send a message to the shop below</p>
            </div>
          ) : messages.map((msg) => {
            const isMe = msg.senderType === "customer";
            return (
              <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-xs md:max-w-md rounded-2xl px-4 py-3",
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm"
                )}>
                  {!isMe && <p className="text-[10px] font-semibold text-slate-400 mb-1">{orgInfo.name}</p>}
                  <p className="text-sm leading-relaxed">{msg.body}</p>
                  <p className={cn("text-[10px] mt-1", isMe ? "text-primary-foreground/60" : "text-slate-400")}>
                    {new Date(msg.createdAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Message ${orgInfo.name}…`}
              className="min-h-[52px] max-h-32 resize-none text-sm"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <Button onClick={handleSend} disabled={isSending || !body.trim()} size="icon" className="h-[52px] w-12 flex-shrink-0">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </PortalLayout>
  );
}
