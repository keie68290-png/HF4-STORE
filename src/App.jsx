import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Admin from "./Admin";

const DISCORD_URL = "https://discord.gg/HF4";

// حساب السعر بعد الخصم
function getDiscount(product) {
  const value = Number(product.discount_percent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function getPrice(product) {
  const price = Number(product.price) || 0;
  const discount = getDiscount(product);
  return price * (1 - discount / 100);
}

function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/admin") return <AdminGate />;
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setLoggedIn(!!session && !session.user.is_anonymous);
    });
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
        <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} required />
        <button disabled={sending}>{sending ? "جاري الدخول..." : "تسجيل الدخول"}</button>
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

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOptionsOpen, setCheckoutOptionsOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTicket, setSupportTicket] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportText, setSupportText] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState("");

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

  useEffect(() => {
    async function restoreSupportTicket() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || !user.is_anonymous) return;

      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("customer_id", user.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Restore support ticket:", error.message);
        return;
      }
      if (data) setSupportTicket(data);
    }
    restoreSupportTicket();
  }, []);

  const discountedProducts = products.filter(product =>
    getDiscount(product) > 0 && product.is_available
  );

  const filteredProducts = products.filter(product => {
    const category = categories.find(c => c.id === product.category_id);
    const matchesCategory = activeCategory === "الكل" || category?.name === activeCategory;
    const matchesSearch = (product.name || "").toLowerCase().includes(search.toLowerCase());
    const price = getPrice(product);
    return matchesCategory && matchesSearch && price >= minPrice && price <= maxPrice;
  });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + getPrice(item) * item.quantity, 0);

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(id, amount) {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, quantity: item.quantity + amount } : item)
      .filter(item => item.quantity > 0)
    );
  }

  function removeFromCart(id) {
    setCart(prev => prev.filter(item => item.id !== id));
  }

  function clearCart() {
    setCart([]);
  }

  function showOffers() {
    document.getElementById("offer")?.scrollIntoView({ behavior: "smooth" });
  }

  async function getCustomerUser() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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

  async function loadSupportMessages(ticketId) {
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setSupportMessages(data || []);
  }

  async function getOrCreateSupportTicket(user) {
    const { data: existing, error: findError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("customer_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        customer_id: user.id,
        customer_name: "زائر"
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function checkoutCart() {
    if (!cart.length || sending) return;

    setSending(true);
    setError("");

    try {
      const user = await getCustomerUser();
      const ticket = await getOrCreateSupportTicket(user);

      const orderDetails = cart.map(item => {
        const originalPrice = Number(item.price) || 0;
        const finalPrice = getPrice(item);
        const discount = getDiscount(item);
        return `• ${item.name} | الكمية: ${item.quantity} | السعر: $${finalPrice.toFixed(2)}${discount ? ` | خصم ${discount}% (السعر الأصلي $${originalPrice.toFixed(2)})` : ""} | الإجمالي: $${(finalPrice * item.quantity).toFixed(2)}`;
      }).join("\n");

      const orderMessage =
        `🛒 طلب جديد من HF4 STORE\n\n${orderDetails}\n\nالمجموع النهائي: $${cartTotal.toFixed(2)}\n\nأرغب بإتمام الطلب. يرجى التواصل معي لتأكيد الطلب وتوضيح طريقة الدفع والتسليم.`;

      const { error: messageError } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          message: orderMessage
        });

      if (messageError) throw messageError;

      setSupportTicket(ticket);
      await loadSupportMessages(ticket.id);
      setSupportOpen(true);
      setCartOpen(false);
      setCheckoutOptionsOpen(false);
      setSupportText("");
      clearCart();
    } catch (err) {
      setError(err.message || "تعذر إرسال الطلب للدعم");
    } finally {
      setSending(false);
    }
  }

  async function openSupport() {
    setSupportOpen(true);
    setSupportError("");
    setSupportLoading(true);

    try {
      const user = await getCustomerUser();
      const ticket = await getOrCreateSupportTicket(user);
      setSupportTicket(ticket);
      await loadSupportMessages(ticket.id);
    } catch (err) {
      setSupportError(err.message || "تعذر فتح الدعم");
    } finally {
      setSupportLoading(false);
    }
  }

  async function sendSupportMessage(e) {
    e.preventDefault();
    if (!supportText.trim() || !supportTicket || supportTicket.status !== "open") return;

    setSupportLoading(true);
    setSupportError("");

    try {
      const user = await getCustomerUser();
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: supportTicket.id,
        sender_id: user.id,
        message: supportText.trim()
      });
      if (error) throw error;

      setSupportText("");
      await loadSupportMessages(supportTicket.id);
    } catch (err) {
      setSupportError(err.message || "تعذر إرسال الرسالة");
    } finally {
      setSupportLoading(false);
    }
  }

  async function closeSupportTicket() {
    if (!supportTicket) return;
    if (!window.confirm("متأكد إنك بدك تغلق تذكرة الدعم؟")) return;

    setSupportLoading(true);
    setSupportError("");

    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .eq("id", supportTicket.id);

      if (error) throw error;
      setSupportTicket({ ...supportTicket, status: "closed" });
    } catch (err) {
      setSupportError(err.message || "تعذر إغلاق التذكرة");
    } finally {
      setSupportLoading(false);
    }
  }

  async function startConversation() {
    setSending(true);
    setError("");

    try {
      const user = await getCustomerUser();
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          customer_id: user.id,
          customer_name: "زائر",
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

  function ProductCard({ product, index = 0 }) {
    const discount = getDiscount(product);
    const finalPrice = getPrice(product);

    return (
      <article className="product-card" key={product.id}>
        <div className="product-image">
          {product.image_url
            ? <img src={product.image_url} alt={product.name} />
            : <div className="image-placeholder">HF4</div>}

          {discount > 0 ? (
            <span className="product-badge" style={{
              background: "#087cff",
              color: "#fff",
              fontWeight: "bold",
              zIndex: 2
            }}>
              🔥 عرض {discount}%
            </span>
          ) : (
            <span className="product-badge">
              {index === 0 ? "★ مميز" : index === 1 ? "♨ الأكثر مبيعاً" : index === 2 ? "★ مميز" : "⚡ جديد"}
            </span>
          )}
        </div>

        <div className="product-info">
          <h3>{product.name}</h3>
          <p>{product.description || "حساب ألعاب مميز ومضمون"}</p>

          <div className="product-bottom">
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {discount > 0 && (
                <del style={{ color: "#999", fontSize: "13px" }}>
                  ${Number(product.price).toFixed(2)}
                </del>
              )}
              <strong style={discount > 0 ? { color: "#168cff" } : {}}>
                ${finalPrice.toFixed(2)}
              </strong>
            </div>

            <button disabled={!product.is_available} onClick={() => addToCart(product)}>
              {product.is_available ? "🛒 أضف للسلة" : "غير متوفر"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="store" dir="rtl">
      <nav className="navbar">
        <a className="logo" href="#home">HF<span>4</span> STORE</a>

        <div className="nav-links">
          <a className="selected" href="#home">⌂ الرئيسية</a>
          <a href="#products">جميع الحسابات</a>
          <a href="#offer" onClick={e => {
            e.preventDefault();
            showOffers();
          }}>العروض</a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>
          <a href="#support" onClick={e => { e.preventDefault(); openSupport(); }}>الدعم</a>
          <a href="#about">معلومات</a>
        </div>

        <div className="nav-actions">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن حساب..." />
          <a href="/admin" title="الإدارة">♙</a>
          <button type="button" title="السلة" onClick={() => setCartOpen(true)}
            style={{ cursor: "pointer", border: "none", background: "transparent", color: "inherit", fontSize: "18px" }}>
            🛒 ({cartCount})
          </button>
        </div>
      </nav>

      <header className="hero" id="home">
        <div className="hero-content">
          <div className="hero-promise">
            <h3>حسابات ألعاب مضمونة 100%</h3>
            <p>أمان كامل - تسليم فوري</p>
            <a className="main-button" href="#products">تصفح الحسابات 🛒</a>
          </div>
          <div className="hero-brand">
            <h1>HF<span>4</span></h1>
            <h2>STORE</h2>
            <p>BUY • PLAY • ENJOY</p>
          </div>
          <div className="hero-slogan">NO RISK<br /><span>NO MERCY</span></div>
          <div className="hero-character">HF4</div>
        </div>
      </header>

      <section className="features">
        <div className="feature"><b>♧</b><div><strong>دعم فني سريع</strong><small>على مدار الساعة</small></div></div>
        <div className="feature"><b>ϟ</b><div><strong>تسليم فوري</strong><small>بعد إتمام الطلب</small></div></div>
        <div className="feature"><b>♢</b><div><strong>حسابات مضمونة</strong><small>100% آمنة</small></div></div>
        <div className="feature"><b>▣</b><div><strong>إتمام الطلب</strong><small>عبر الدعم أو Discord</small></div></div>
      </section>

      <main id="products" className="products-section">
        <div className="section-heading"><h2>أحدث الحسابات</h2><span>✦</span></div>

        <div className="shop-layout">
          <aside className="filter-sidebar">
            <h3>⚑ تصفية النتائج</h3>
            <h4>الفئة</h4>

            {["الكل", ...categories.map(c => c.name)].map(name => (
              <button key={name}
                className={activeCategory === name ? "filter-option active" : "filter-option"}
                onClick={() => setActiveCategory(name)}>
                <span>{activeCategory === name ? "🔵" : "◯"}</span>
                {name === "الكل" ? "جميع الفئات" : name}
              </button>
            ))}

            <h4>نطاق السعر</h4>
            <div className="price-range">
              <label>${minPrice}</label>
              <input type="range" min="0" max="200" value={minPrice}
                onChange={e => setMinPrice(Math.min(Number(e.target.value), maxPrice))} />
              <input type="range" min="0" max="200" value={maxPrice}
                onChange={e => setMaxPrice(Math.max(Number(e.target.value), minPrice))} />
              <label>${maxPrice}</label>
            </div>

            <button className="filter-reset" onClick={() => {
              setActiveCategory("الكل");
              setMinPrice(0);
              setMaxPrice(200);
              setSearch("");
            }}>تطبيق الفلتر</button>
          </aside>

          <div className="products-area">
            {loading ? <p className="empty">جاري تحميل المنتجات...</p> :
              filteredProducts.length === 0 ? <p className="empty">لا توجد منتجات مطابقة حالياً.</p> :
              <div className="product-grid">
                {filteredProducts.map((product, index) => (
                  <ProductCard key={product.id} product={product} index={index} />
                ))}
              </div>
            }
          </div>
        </div>
      </main>

      {/* قسم العروض */}
      <section id="offer" className="products-section" style={{ scrollMarginTop: "100px" }}>
        <div className="section-heading">
          <h2>🔥 العروض والخصومات</h2>
          <span>✦</span>
        </div>

        {loading ? (
          <p className="empty">جاري تحميل العروض...</p>
        ) : discountedProducts.length === 0 ? (
          <div className="empty" style={{
            textAlign: "center",
            padding: "55px 20px",
            background: "#111827",
            border: "1px solid #087cff",
            borderRadius: "14px",
            lineHeight: 2
          }}>
            <h2 style={{ color: "#168cff" }}>🎁 لا توجد عروض حالياً</h2>
            <p>انتظرونا في العروض القادمة!</p>
          </div>
        ) : (
          <div className="product-grid">
            {discountedProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </section>

      <section className="faq-section" id="faq">
        <div className="section-heading"><h2>الأسئلة الشائعة</h2><span>✦</span></div>
        <div className="faq-container">
          <details className="faq-item">
            <summary>كيف أطلب منتج من HF4 STORE؟</summary>
            <p>اختار المنتجات اللي بدك إياها واضغط على أضف للسلة، وبعدها افتح السلة واضغط متابعة الطلب.</p>
          </details>
          <details className="faq-item">
            <summary>كيف بستلم المنتج بعد الطلب؟</summary>
            <p>بعد التواصل مع الإدارة وتأكيد الطلب، رح يتم توضيح طريقة استلام المنتج إلك.</p>
          </details>
          <details className="faq-item">
            <summary>كيف أتواصل مع الدعم الفني؟</summary>
            <p>اضغط على «الدعم» أعلى الموقع لفتح تذكرة دعم مباشرة، أو تواصل عبر Discord.</p>
          </details>
          <details className="faq-item">
            <summary>هل يوجد دفع عبر الموقع؟</summary>
            <p>لا، الدفع غير متوفر عبر الموقع. إتمام الطلب والدفع يتم فقط عبر محادثة الدعم أو Discord.</p>
          </details>
          <details className="faq-item">
            <summary>هل جميع المنتجات متوفرة؟</summary>
            <p>توفر المنتجات يعتمد على المخزون، وتقدر تشوف حالة التوفر عند كل منتج في المتجر.</p>
          </details>
        </div>
      </section>

      <section className="about" id="about">
        <h2>HF4 STORE</h2>
        <p>وجهتك الأولى للتسوّق. اكتشف منتجاتنا واستمتع بتجربة تسوّق آمنة وسهلة</p>
      </section>

      <footer>© 2026 HF4 STORE - جميع الحقوق محفوظة</footer>

      {/* سلة المشتريات */}
      {cartOpen && (
        <div className="modal-overlay" onClick={() => setCartOpen(false)}>
          <div className="order-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCartOpen(false)}>✕</button>
            <h2>🛒 سلة مشترياتك</h2>

            {cart.length === 0 ? <p>السلة فارغة حالياً</p> : <>
              {cart.map(item => {
                const discount = getDiscount(item);
                const price = getPrice(item);
                return (
                  <div key={item.id} style={{ padding: "12px", borderBottom: "1px solid #444", textAlign: "right" }}>
                    <strong>{item.name}</strong>
                    {discount > 0 && <p style={{ color: "#168cff" }}>عرض {discount}%</p>}
                    {discount > 0 && <del style={{ color: "#999" }}>السعر الأصلي: ${Number(item.price).toFixed(2)}</del>}
                    <p>السعر: ${price.toFixed(2)}</p>
                    <p>الكمية: {item.quantity}</p>
                    <p>المجموع: ${(price * item.quantity).toFixed(2)}</p>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button type="button" onClick={() => changeQuantity(item.id, 1)}>+</button>
                      <button type="button" onClick={() => changeQuantity(item.id, -1)}>−</button>
                      <button type="button" onClick={() => removeFromCart(item.id)}>حذف</button>
                    </div>
                  </div>
                );
              })}

              <h3>المجموع النهائي: ${cartTotal.toFixed(2)}</h3>
              <p style={{ color: "#aaa", lineHeight: 1.8 }}>
                الدفع غير متوفر عبر الموقع. إتمام الطلب والدفع يتم فقط عبر محادثة الدعم أو Discord.
              </p>
              <button className="modal-submit" onClick={() => {
                setError("");
                setCheckoutOptionsOpen(true);
              }} disabled={!cart.length}>
                متابعة الطلب
              </button>
              <button type="button" onClick={clearCart} style={{ marginTop: "10px" }}>إفراغ السلة</button>
            </>}

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {/* اختيار طريقة إتمام الطلب */}
      {checkoutOptionsOpen && (
        <div className="modal-overlay" onClick={() => !sending && setCheckoutOptionsOpen(false)}>
          <div className="order-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" disabled={sending} onClick={() => setCheckoutOptionsOpen(false)}>✕</button>
            <h2>إتمام طلبك</h2>
            <p style={{ lineHeight: 1.9 }}>
              طرق الدفع غير متوفرة عبر الموقع. إتمام الطلب والدفع يتم فقط عبر محادثة الدعم أو Discord.
            </p>
            <button className="modal-submit" disabled={sending} onClick={checkoutCart}>
              {sending ? "جاري إرسال تفاصيل الطلب..." : "🎧 فتح تذكرة مع الدعم وإرسال الطلب"}
            </button>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer"
              className="modal-submit"
              style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: "12px" }}>
              💬 التواصل عبر Discord
            </a>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {/* محادثة المنتج القديمة */}
      {selectedProduct && (
        <div className="modal-overlay">
          <div className="order-modal">
            <button className="modal-close" onClick={() => {
              setSelectedProduct(null);
              setConversationId(null);
              setMessages([]);
            }}>✕</button>

            <h2>HF4 STORE</h2>
            <p>المنتج: {selectedProduct.name}</p>
            <p>السعر: ${getPrice(selectedProduct).toFixed(2)}</p>

            {!conversationId ? <>
              <p>ابدأ محادثة مع الإدارة لإتمام طلبك.</p>
              <button className="modal-submit" onClick={startConversation} disabled={sending}>
                {sending ? "جاري الإنشاء..." : "ابدأ المحادثة"}
              </button>
            </> : <>
              <p>بدأت محادثتك مع الإدارة.</p>
              <div className="chat-messages">
                {messages.length === 0 ? <p>أرسل رسالتك الأولى للإدارة.</p> :
                  messages.map(msg => <p key={msg.id}>{msg.message}</p>)}
              </div>
              <button className="refresh-chat" onClick={refreshMessages}>تحديث الرسائل</button>
              <form onSubmit={sendMessage}>
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="اكتب رسالتك..." />
                <button className="modal-submit" disabled={sending}>إرسال</button>
              </form>
            </>}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {/* الدعم الفني */}
      {supportOpen && (
        <div className="hf4-support-page" dir="rtl">
          <header className="hf4-support-header">
            <div><strong>HF4 STORE</strong><span>مركز الدعم الفني</span></div>
            <button onClick={() => setSupportOpen(false)}>العودة للمتجر ✕</button>
          </header>

          <main className="hf4-support-main">
            <h1>الدعم الفني</h1>
            <p className="hf4-support-subtitle">احكيلنا شو المشكلة، وفريق HF4 STORE رح يساعدك.</p>

            {supportLoading && !supportTicket ? <p>جاري تحميل تذكرة الدعم...</p> :
              !supportTicket ? (
                <div className="hf4-support-start">
                  <h2>افتح تذكرة دعم جديدة</h2>
                  <p>اضغط الزر لبدء محادثة مع فريق الدعم، بدون الحاجة لكتابة اسمك.</p>
                  <button disabled={supportLoading} onClick={openSupport}>
                    {supportLoading ? "جاري الإنشاء..." : "ابدأ محادثة الدعم"}
                  </button>
                  <p><a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">أو تواصل عبر Discord</a></p>
                </div>
              ) : (
                <section className="hf4-support-chat">
                  <div className="hf4-support-ticket-head">
                    <div>
                      <strong>تذكرة الدعم</strong>
                      <small>الحالة: {supportTicket.status === "open" ? "مفتوحة" : "مغلقة"}</small>
                    </div>
                    <button onClick={() => loadSupportMessages(supportTicket.id).catch(e => setSupportError(e.message))}>تحديث</button>
                  </div>

                  <div className="hf4-support-message-list">
                    {supportMessages.length === 0 ? <p>أهلاً بك! اكتب رسالتك الأولى لفريق الدعم.</p> :
                      supportMessages.map(msg => (
                        <div key={msg.id}
                          className={msg.sender_id === supportTicket.customer_id ? "hf4-support-message mine" : "hf4-support-message"}>
                          <small>{msg.sender_id === supportTicket.customer_id ? "أنت" : "الدعم الفني"}</small>
                          <p>{msg.message}</p>
                          <time>{new Date(msg.created_at).toLocaleString("ar")}</time>
                        </div>
                      ))}
                  </div>

                  {supportTicket.status === "open" ? (
                    <form className="hf4-support-send" onSubmit={sendSupportMessage}>
                      <input value={supportText} onChange={e => setSupportText(e.target.value)} placeholder="اكتب رسالتك..." />
                      <button disabled={supportLoading || !supportText.trim()}>إرسال</button>
                      <button type="button" className="close-ticket" disabled={supportLoading} onClick={closeSupportTicket}>إغلاق التذكرة</button>
                    </form>
                  ) : (
                    <div className="hf4-support-closed">
                      <p>هذه التذكرة مغلقة.</p>
                      <button onClick={() => {
                        setSupportTicket(null);
                        setSupportMessages([]);
                        setSupportText("");
                      }}>فتح تذكرة جديدة</button>
                    </div>
                  )}
                </section>
              )}

            {supportError && <p className="hf4-support-error">{supportError}</p>}
          </main>
        </div>
      )}
    </div>
  );
}

export default App;