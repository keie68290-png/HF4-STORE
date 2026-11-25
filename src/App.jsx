import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Admin from "./Admin";

function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/admin") {
    return <AdminGate />;
  }
  return <Store />;
}

function AdminGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setError(error.message);
      setLoggedIn(!!data.session && !data.session.user.is_anonymous);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setLoggedIn(!!session && !session.user.is_anonymous);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setSending(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) setError(error.message);
    else setLoggedIn(true);

    setSending(false);
  }

  if (loading) return <div className="admin-loading">جاري التحقق...</div>;
  if (loggedIn) return <Admin />;

  return (
    <div className="admin-login" dir="rtl">
      <form onSubmit={handleLogin}>
        <h1>HF4 <span>STORE</span></h1>
        <h3>دخول الإدارة</h3>
        <input
          type="email"
          placeholder="البريد الإلكتروني"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="كلمة المرور"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button disabled={sending}>
          {sending ? "جاري الدخول..." : "تسجيل الدخول"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

function Store() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(200);

  // محادثة المنتج
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // محادثة الدعم المستقلة
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportTicketId, setSupportTicketId] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportClosed, setSupportClosed] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStore() {
      const [p, c] = await Promise.all([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("categories").select("*")
      ]);

      if (!p.error) setProducts(p.data || []);
      else console.error(p.error);

      if (!c.error) setCategories(c.data || []);
      else console.error(c.error);

      setLoading(false);
    }

    loadStore();
  }, []);

  async function getCustomerUser() {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    let user = sessionData.session?.user;

    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }

    if (!user?.is_anonymous) {
      throw new Error("افتح المتجر من نافذة خاصة للزبائن.");
    }

    return user;
  }

  // تحميل رسائل تذكرة الدعم
  async function loadSupportMessages(id = supportTicketId) {
    if (!id) return;

    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setSupportMessages(data || []);
  }

  // استعادة تذكرة الدعم المفتوحة عند فتح المتجر
  useEffect(() => {
    let active = true;

    async function restoreSupportTicket() {
      try {
        const user = await getCustomerUser();

        const { data, error } = await supabase
          .from("support_tickets")
          .select("*")
          .eq("customer_id", user.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!active || !data) return;

        setSupportTicketId(data.id);
        setSupportName(data.customer_name || "");
        
        const { data: msgs, error: messagesError } = await supabase
          .from("support_messages")
          .select("*")
          .eq("ticket_id", data.id)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;
        if (active) setSupportMessages(msgs || []);
      } catch (err) {
        console.error("تعذر استعادة تذكرة الدعم:", err.message);
      }
    }

    restoreSupportTicket();

    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = products.filter(product => {
    const category = categories.find(c => c.id === product.category_id);
    const matchesCategory =
      activeCategory === "الكل" || category?.name === activeCategory;
    const matchesSearch = (product.name || "")
      .toLowerCase()
      .includes(search.toLowerCase());
    const price = Number(product.price) || 0;

    return matchesCategory && matchesSearch &&
      price >= minPrice && price <= maxPrice;
  });

  // بدء محادثة طلب منتج
  async function startConversation() {
    if (!customerName.trim()) {
      setError("اكتب اسمك أولاً");
      return;
    }

    setSending(true);
    setError("");

    try {
      const user = await getCustomerUser();

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          customer_id: user.id,
          customer_name: customerName.trim(),
          product_id: selectedProduct.id
        })
        .select()
        .single();

      if (error) throw error;

      setConversationId(data.id);
      setMessages([]);
    } catch (err) {
      setError(err.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  }

  async function refreshMessages() {
    if (!conversationId) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) setError(error.message);
    else setMessages(data || []);
  }

  async function sendMessage(e) {
    e.preventDefault();

    if (!newMessage.trim() || !conversationId) return;

    setSending(true);
    setError("");

    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!user) throw new Error("انتهت الجلسة.");

      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message: newMessage.trim()
      });

      if (error) throw error;

      setNewMessage("");
      await refreshMessages();
    } catch (err) {
      setError(err.message || "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  // فتح الدعم واستعادة التذكرة
  async function openSupport() {
    setSupportOpen(true);
    setError("");

    setSupportLoading(true);

    try {
      const user = await getCustomerUser();

      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("customer_id", user.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSupportTicketId(data.id);
        setSupportName(data.customer_name || "");
        setSupportClosed(false);
        await loadSupportMessages(data.id);
      } else {
        setSupportTicketId(null);
        setSupportMessages([]);
      }
    } catch (err) {
      setError(err.message || "تعذر فتح الدعم");
    } finally {
      setSupportLoading(false);
    }
  }

  // إنشاء تذكرة دعم جديدة
  async function startSupportTicket(e) {
    e.preventDefault();

    if (!supportName.trim()) {
      setError("اكتب اسمك أولاً");
      return;
    }

    setSupportLoading(true);
    setError("");

    try {
      const user = await getCustomerUser();

      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          customer_id: user.id,
          customer_name: supportName.trim(),
          status: "open"
        })
        .select()
        .single();

      if (error) throw error;

      setSupportTicketId(data.id);
      setSupportMessages([]);
      setSupportClosed(false);
    } catch (err) {
      setError(err.message || "تعذر إنشاء تذكرة الدعم");
    } finally {
      setSupportLoading(false);
    }
  }

  // إرسال رسالة للدعم
  async function sendSupportMessage(e) {
    e.preventDefault();

    if (!supportMessage.trim() || !supportTicketId) return;

    setSupportLoading(true);
    setError("");

    try {
      const user = await getCustomerUser();

      const { error } = await supabase.from("support_messages").insert({
        ticket_id: supportTicketId,
        sender_id: user.id,
        message: supportMessage.trim()
      });

      if (error) throw error;

      setSupportMessage("");
      await loadSupportMessages();
    } catch (err) {
      setError(err.message || "تعذر إرسال الرسالة");
    } finally {
      setSupportLoading(false);
    }
  }

  // إغلاق تذكرة الدعم
  async function closeSupportTicket() {
    if (!supportTicketId) return;

    const confirmed = window.confirm("هل أنت متأكد من إغلاق تذكرة الدعم؟");
    if (!confirmed) return;

    setSupportLoading(true);
    setError("");

    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .eq("id", supportTicketId);

      if (error) throw error;

      setSupportClosed(true);
      setSupportTicketId(null);
      setSupportMessages([]);
      setSupportName("");
    } catch (err) {
      setError(err.message || "تعذر إغلاق التذكرة");
    } finally {
      setSupportLoading(false);
    }
  }

  return (
    <div className="store" dir="rtl">
      <nav className="navbar">
        <a className="logo" href="#home">
          HF<span>4</span> STORE
        </a>

        <div className="nav-links">
          <a className="selected" href="#home">⌂ الرئيسية</a>
          <a href="#products">جميع الحسابات</a>
          <a href="#offer">العروض</a>
          <a
            href="https://discord.gg/HF4"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
          <a href="#support" onClick={e => {
            e.preventDefault();
            openSupport();
          }}>
            الدعم
          </a>
          <a href="#about">معلومات</a>
        </div>

        <div className="nav-actions">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن حساب..."
          />
          <a href="/admin" title="الإدارة">♙</a>
          <a href="#products" title="السلة">🛒</a>
        </div>
      </nav>

      <header className="hero" id="home">
        <div className="hero-content">
          <div className="hero-promise">
            <h3>حسابات ألعاب مضمونة 100%</h3>
            <p>أمان كامل - تسليم فوري</p>
            <a className="main-button" href="#products">
              تصفح الحسابات 🛒
            </a>
          </div>

          <div className="hero-brand">
            <h1>HF<span>4</span></h1>
            <h2>STORE</h2>
            <p>BUY • PLAY • ENJOY</p>
          </div>

          <div className="hero-slogan">
            NO RISK<br /><span>NO MERCY</span>
          </div>

          <div className="hero-character">HF4</div>
        </div>
      </header>

      <section className="features">
        <div className="feature">
          <b>♧</b>
          <div><strong>دعم فني سريع</strong><small>على مدار الساعة</small></div>
        </div>
        <div className="feature">
          <b>ϟ</b>
          <div><strong>تسليم فوري</strong><small>بعد إتمام الطلب</small></div>
        </div>
        <div className="feature">
          <b>♢</b>
          <div><strong>حسابات مضمونة</strong><small>100% آمنة</small></div>
        </div>
        <div className="feature">
          <b>▣</b>
          <div><strong>طرق متعددة</strong><small>دفع آمن وسهل</small></div>
        </div>
      </section>

      <main id="products" className="products-section">
        <div className="section-heading">
          <h2>أحدث الحسابات</h2>
          <span>✦</span>
        </div>

        <div className="shop-layout">
          <aside className="filter-sidebar">
            <h3>⚑ تصفية النتائج</h3>
            <h4>الفئة</h4>

            {["الكل", ...categories.map(c => c.name)].map(name => (
              <button
                key={name}
                className={
                  activeCategory === name
                    ? "filter-option active"
                    : "filter-option"
                }
                onClick={() => setActiveCategory(name)}
              >
                <span>{activeCategory === name ? "🔵" : "◯"}</span>
                {name === "الكل" ? "جميع الفئات" : name}
              </button>
            ))}

            <h4>نطاق السعر</h4>

            <div className="price-range">
              <label>${minPrice}</label>
              <input
                type="range"
                min="0"
                max="200"
                value={minPrice}
                onChange={e =>
                  setMinPrice(Math.min(Number(e.target.value), maxPrice))
                }
              />
              <input
                type="range"
                min="0"
                max="200"
                value={maxPrice}
                onChange={e =>
                  setMaxPrice(Math.max(Number(e.target.value), minPrice))
                }
              />
              <label>${maxPrice}</label>
            </div>

            <button
              className="filter-reset"
              onClick={() => {
                setActiveCategory("الكل");
                setMinPrice(0);
                setMaxPrice(200);
                setSearch("");
              }}
            >
              تطبيق الفلتر
            </button>
          </aside>

          <div className="products-area">
            {loading ? (
              <p className="empty">جاري تحميل المنتجات...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="empty">لا توجد منتجات مطابقة حالياً.</p>
            ) : (
              <div className="product-grid">
                {filteredProducts.map((product, index) => (
                  <article className="product-card" key={product.id}>
                    <div className="product-image">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <div className="image-placeholder">HF4</div>
                      )}

                      <span className="product-badge">
                        {index === 0
                          ? "★ مميز"
                          : index === 1
                          ? "♨ الأكثر مبيعاً"
                          : index === 2
                          ? "★ مميز"
                          : "⚡ جديد"}
                      </span>
                    </div>

                    <div className="product-info">
                      <h3>{product.name}</h3>
                      <p>
                        {product.description || "حساب ألعاب مميز ومضمون"}
                      </p>

                      <div className="product-bottom">
                        <strong>${Number(product.price).toFixed(2)}</strong>
                        <button
                          disabled={!product.is_available}
                          onClick={() => {
                            setSelectedProduct(product);
                            setCustomerName("");
                            setConversationId(null);
                            setMessages([]);
                            setNewMessage("");
                            setError("");
                          }}
                        >
                          {product.is_available ? "🛒 أضف للسلة" : "غير متوفر"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <section className="offer-banner" id="offer">
        <div className="offer-crown">♛</div>
        <div>
          <h2>عرض خاص لفترة محدودة</h2>
          <p>احصل على حساب مميز بسعر لا يفوت!</p>
        </div>
        <a href="#products">تسوق الآن ❯❯</a>
        <div className="offer-logo">HF<span>4</span> STORE</div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-heading">
          <h2>الأسئلة الشائعة</h2>
          <span>✦</span>
        </div>

        <div className="faq-container">
          <details className="faq-item">
            <summary>كيف أطلب منتج من HF4 STORE؟</summary>
            <p>
              اختار المنتج اللي بدك إياه واضغط على زر أضف للسلة،
              وبعدها اكتب اسمك وابدأ المحادثة مع الإدارة لإكمال طلبك.
            </p>
          </details>

          <details className="faq-item">
            <summary>كيف بستلم المنتج بعد الطلب؟</summary>
            <p>
              بعد التواصل مع الإدارة وتأكيد الطلب، رح يتم توضيح
              طريقة استلام المنتج إلك.
            </p>
          </details>

          <details className="faq-item">
            <summary>كيف أتواصل مع الدعم الفني؟</summary>
            <p>
              اضغط على الدعم من القائمة العلوية لفتح تذكرة دعم مستقلة،
              أو تواصل معنا من خلال سيرفر Discord.
            </p>
          </details>

          <details className="faq-item">
            <summary>شو أعمل إذا واجهتني مشكلة؟</summary>
            <p>
              تواصل مع الإدارة واشرح المشكلة بالتفصيل حتى نقدر نساعدك.
            </p>
          </details>

          <details className="faq-item">
            <summary>هل جميع المنتجات متوفرة؟</summary>
            <p>
              توفّر المنتجات يعتمد على المخزون، وتقدر تشوف حالة
              التوفر عند كل منتج في المتجر.
            </p>
          </details>
        </div>
      </section>

      <section className="about" id="about">
        <h2>HF4 STORE</h2>
        <p>
          وجهتك الأولى للتسوّق. اكتشف منتجاتنا واستمتع بتجربة تسوّق آمنة وسهلة
        </p>
      </section>

      <footer>© 2026 HF4 STORE - جميع الحقوق محفوظة</footer>

      {/* نافذة محادثة المنتج */}
      {selectedProduct && (
        <div className="modal-overlay">
          <div className="order-modal">
            <button
              className="modal-close"
              onClick={() => setSelectedProduct(null)}
            >
              ✕
            </button>

            <h2>HF4 STORE</h2>
            <p>المنتج: {selectedProduct.name}</p>
            <p>السعر: {selectedProduct.price} ₪</p>

            {!conversationId ? (
              <>
                <p>أدخل اسمك لبدء المحادثة مع الإدارة:</p>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="اسمك"
                />
                <button
                  className="modal-submit"
                  onClick={startConversation}
                  disabled={sending}
                >
                  {sending ? "جاري الإنشاء..." : "ابدأ المحادثة"}
                </button>
              </>
            ) : (
              <>
                <p>أهلاً {customerName}، بدأت محادثتك.</p>

                <div className="chat-messages">
                  {messages.length === 0 ? (
                    <p>أرسل رسالتك الأولى للإدارة.</p>
                  ) : (
                    messages.map(msg => (
                      <p key={msg.id}>{msg.message}</p>
                    ))
                  )}
                </div>

                <button className="refresh-chat" onClick={refreshMessages}>
                  تحديث الرسائل
                </button>

                <form onSubmit={sendMessage}>
                  <input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="اكتب رسالتك..."
                  />
                  <button className="modal-submit" disabled={sending}>
                    إرسال
                  </button>
                </form>
              </>
            )}

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {/* نافذة الدعم المستقلة */}
      {supportOpen && (
        <div className="modal-overlay support-overlay">
          <div className="order-modal support-modal">
            <button
              className="modal-close"
              onClick={() => setSupportOpen(false)}
            >
              ✕
            </button>

            <h2>دعم HF4 STORE</h2>
            <p>أهلاً بك! كيف يمكننا مساعدتك؟</p>

            {supportLoading && !supportTicketId && (
              <p>جاري التحقق من تذكرة الدعم...</p>
            )}

            {!supportTicketId ? (
              <form onSubmit={startSupportTicket}>
                <p>
                  {supportClosed
                    ? "تم إغلاق تذكرتك السابقة. يمكنك فتح تذكرة جديدة."
                    : "اكتب اسمك لفتح تذكرة دعم جديدة:"}
                </p>
                <input
                  value={supportName}
                  onChange={e => setSupportName(e.target.value)}
                  placeholder="اسمك"
                  required
                />
                <button
                  className="modal-submit"
                  disabled={supportLoading}
                >
                  {supportLoading ? "جاري الإنشاء..." : "فتح تذكرة دعم"}
                </button>
              </form>
            ) : (
              <>
                <div className="chat-messages support-messages">
                  {supportMessages.length === 0 ? (
                    <p>أرسل رسالتك الأولى لفريق الدعم.</p>
                  ) : (
                    supportMessages.map(msg => (
                      <div className="support-message" key={msg.id}>
                        <p>{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>

                <button
                  className="refresh-chat"
                  onClick={() => loadSupportMessages()}
                >
                  تحديث الرسائل
                </button>

                <form onSubmit={sendSupportMessage}>
                  <input
                    value={supportMessage}
                    onChange={e => setSupportMessage(e.target.value)}
                    placeholder="اكتب رسالتك للدعم..."
                    required
                  />
                  <button
                    className="modal-submit"
                    disabled={supportLoading}
                  >
                    إرسال
                  </button>
                </form>

                <button
                  className="refresh-chat"
                  style={{ background: "#a52b3c", marginTop: "12px" }}
                  onClick={closeSupportTicket}
                  disabled={supportLoading}
                >
                  إغلاق تذكرة الدعم
                </button>
              </>
            )}

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;