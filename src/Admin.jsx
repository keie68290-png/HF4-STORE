import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import "./App.css";

const emptyProduct = {
  name: "",
  description: "",
  price: "",
  image_url: "",
  category_id: "",
  is_available: true
};

export default function Admin() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [activePage, setActivePage] = useState("الرئيسية");

  const [conversations, setConversations] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [ordersCount, setOrdersCount] = useState(0);

  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState("conversation");
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");

  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProduct, setEditingProduct] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadConversations() {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setConversations(data || []);
  }

  async function loadTickets() {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setTickets(data || []);
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setProducts(data || []);
  }

  async function loadOrdersCount() {
    const { count, error } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    if (!error) setOrdersCount(count || 0);
  }

  useEffect(() => {
    let active = true;

    async function checkAdminAccess() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          setError("خطأ في جلسة الدخول: " + error.message);
          setChecking(false);
          return;
        }

        if (!data.session) {
          setError("لا يوجد حساب مسجل دخوله. سجّل الدخول بحساب الإدارة أولاً.");
          setChecking(false);
          return;
        }

        const currentUser = data.session.user;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, role, is_active")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          setError("تعذر قراءة بيانات الحساب: " + profileError.message);
          setChecking(false);
          return;
        }

        if (!profile) {
          setError("لم يتم العثور على سجل لهذا الحساب في جدول profiles.");
          setChecking(false);
          return;
        }

        const { data: isAdmin, error: adminError } =
          await supabase.rpc("is_store_admin");

        if (!active) return;

        if (adminError) {
          setError("تعذر التحقق من صلاحية المدير: " + adminError.message);
          setChecking(false);
          return;
        }

        if (isAdmin !== true) {
          setError("الحساب لا يملك صلاحية المدير.");
          setChecking(false);
          return;
        }

        setUser(currentUser);

        await Promise.all([
          loadConversations(),
          loadTickets(),
          loadProducts(),
          loadOrdersCount()
        ]);

        if (active) setChecking(false);
      } catch (err) {
        if (active) {
          setError("حدث خطأ: " + (err.message || String(err)));
          setChecking(false);
        }
      }
    }

    checkAdminAccess();

    return () => {
      active = false;
    };
  }, []);

  function updateProductField(field, value) {
    setProductForm(previous => ({
      ...previous,
      [field]: value
    }));
  }

  function startEditProduct(product) {
    setEditingProduct(product);

    setProductForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      image_url: product.image_url || "",
      category_id: product.category_id ?? "",
      is_available: product.is_available ?? true
    });

    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setError("");
    setSuccess("");
  }

  async function saveProduct(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!productForm.name.trim()) {
      setError("اكتب اسم المنتج.");
      return;
    }

    if (
      productForm.price === "" ||
      !Number.isFinite(Number(productForm.price)) ||
      Number(productForm.price) < 0
    ) {
      setError("اكتب سعراً صحيحاً.");
      return;
    }

    const categoryId = productForm.category_id.trim() === ""
      ? null
      : Number(productForm.category_id);

    if (
      categoryId !== null &&
      (!Number.isInteger(categoryId) || categoryId <= 0)
    ) {
      setError("رقم التصنيف يجب أن يكون رقماً صحيحاً.");
      return;
    }

    const productData = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price: Number(productForm.price),
      image_url: productForm.image_url.trim(),
      category_id: categoryId,
      is_available: productForm.is_available
    };

    setLoading(true);

    try {
      let result;

      if (editingProduct) {
        result = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id);
      } else {
        result = await supabase
          .from("products")
          .insert({
            ...productData,
            seller_id: user.id
          });
      }

      if (result.error) throw result.error;

      setSuccess(editingProduct
        ? "تم تعديل المنتج بنجاح!"
        : "تمت إضافة المنتج بنجاح!");

      setEditingProduct(null);
      setProductForm(emptyProduct);
      await loadProducts();
    } catch (err) {
      setError(err.message || "حدث خطأ أثناء حفظ المنتج.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`هل أنت متأكد من حذف المنتج "${product.name}"؟`)) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      setError(error.message);
      return;
    }

    if (editingProduct?.id === product.id) cancelEdit();

    setSuccess("تم حذف المنتج بنجاح.");
    await loadProducts();
  }

  async function toggleProductAvailability(product) {
    const { error } = await supabase
      .from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("تم تحديث حالة المنتج.");
    await loadProducts();
  }

  async function openConversation(item, type = "conversation") {
    setSelected(item);
    setSelectedType(type);
    setError("");

    const table = type === "ticket"
      ? "support_messages"
      : "chat_messages";

    const foreignKey = type === "ticket"
      ? "ticket_id"
      : "conversation_id";

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(foreignKey, item.id)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setMessages(data || []);
  }

  async function sendReply(e) {
    e.preventDefault();

    if (!reply.trim() || !selected || !user) return;

    setLoading(true);
    setError("");

    try {
      const table = selectedType === "ticket"
        ? "support_messages"
        : "chat_messages";

      const foreignKey = selectedType === "ticket"
        ? "ticket_id"
        : "conversation_id";

      const { error } = await supabase
        .from(table)
        .insert({
          [foreignKey]: selected.id,
          sender_id: user.id,
          message: reply.trim()
        });

      if (error) throw error;

      setReply("");
      await openConversation(selected, selectedType);
    } catch (err) {
      setError(err.message || "تعذر إرسال الرد");
    } finally {
      setLoading(false);
    }
  }

  async function closeTicket(ticket) {
    if (!window.confirm("هل تريد إغلاق تذكرة الدعم؟")) return;

    const { error } = await supabase
      .from("support_tickets")
      .update({ status: "closed" })
      .eq("id", ticket.id);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("تم إغلاق التذكرة.");
    await loadTickets();

    if (selected?.id === ticket.id && selectedType === "ticket") {
      setSelected({ ...ticket, status: "closed" });
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setSelected(null);
    setMessages([]);
  }

  const pages = [
    { name: "الرئيسية", icon: "🏠" },
    { name: "المنتجات", icon: "📦" },
    { name: "الطلبات", icon: "🛒" },
    { name: "الزبائن", icon: "👥" },
    { name: "المحادثات", icon: "💬" },
    { name: "تذاكر الدعم", icon: "🎧" },
    { name: "الإعدادات", icon: "⚙️" }
  ];

  const pageStyle = {
    minHeight: "100vh",
    background: "#080f1d",
    color: "white",
    direction: "rtl",
    display: "flex",
    fontFamily: "Arial, sans-serif"
  };

  const buttonStyle = {
    background: "#1677ff",
    color: "white",
    border: "none",
    padding: "12px 18px",
    borderRadius: "8px",
    cursor: "pointer"
  };

  const cardStyle = {
    background: "#101827",
    border: "1px solid #263b5c",
    borderRadius: "13px",
    padding: "20px"
  };

  const inputStyle = {
    width: "100%",
    padding: "13px",
    margin: "7px 0 15px",
    borderRadius: "8px",
    border: "1px solid #354967",
    background: "#080f1d",
    color: "white",
    boxSizing: "border-box"
  };

  if (checking) {
    return (
      <div style={{
        ...pageStyle,
        justifyContent: "center",
        alignItems: "center"
      }}>
        <h2>جاري التحقق من الصلاحية...</h2>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        ...pageStyle,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "20px",
        boxSizing: "border-box"
      }}>
        <h1>HF4 STORE</h1>
        <h2 style={{ color: "#ff7777" }}>ليس لديك صلاحية للوصول!</h2>
        <p>هذه الصفحة مخصصة للإدارة فقط.</p>
        {error && <p style={{ color: "#ffaaaa" }}>{error}</p>}
        <a href="/" style={{ color: "#66aaff" }}>العودة إلى المتجر</a>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <aside style={{
        width: "235px",
        minWidth: "190px",
        background: "#101827",
        borderLeft: "1px solid #263b5c",
        padding: "22px 14px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh"
      }}>
        <h2 style={{ textAlign: "center", color: "#4b9aff", margin: "5px 0 30px" }}>
          HF4 STORE
        </h2>

        <p style={{ color: "#8293aa", fontSize: "12px", paddingRight: "10px" }}>
          القائمة الرئيسية
        </p>

        {pages.map(page => (
          <button
            key={page.name}
            onClick={() => {
              setActivePage(page.name);
              setError("");
              setSuccess("");
              setSelected(null);
              setMessages([]);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              textAlign: "right",
              padding: "14px 12px",
              margin: "4px 0",
              borderRadius: "9px",
              border: "none",
              background: activePage === page.name ? "#203b60" : "transparent",
              color: activePage === page.name ? "#ffffff" : "#aab8ca",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span>{page.icon}</span>
            {page.name}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={logout}
          style={{ ...buttonStyle, background: "#8b2635", width: "100%", marginTop: "20px" }}
        >
          تسجيل خروج
        </button>
      </aside>

      <main style={{
        flex: 1,
        minWidth: 0,
        padding: "25px",
        boxSizing: "border-box"
      }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "25px"
        }}>
          <div>
            <h1 style={{ margin: "0 0 8px" }}>{activePage}</h1>
            <p style={{ color: "#8293aa", margin: 0 }}>
              أهلاً بك في لوحة إدارة HF4 STORE
            </p>
          </div>
          <span style={{
            background: "#123d32",
            color: "#65e6ad",
            padding: "9px 14px",
            borderRadius: "20px",
            fontSize: "13px"
          }}>
            ● المدير متصل
          </span>
        </header>

        {error && (
          <div style={{
            background: "#4b1d29",
            color: "#ffaaaa",
            padding: "13px",
            borderRadius: "8px",
            marginBottom: "15px"
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: "#123d32",
            color: "#65e6ad",
            padding: "13px",
            borderRadius: "8px",
            marginBottom: "15px"
          }}>
            {success}
          </div>
        )}

        {activePage === "الرئيسية" && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "16px",
              marginBottom: "25px"
            }}>
              {[
                { title: "المنتجات", value: products.length, icon: "📦" },
                { title: "الطلبات", value: ordersCount, icon: "🛒" },
                { title: "المحادثات", value: conversations.length, icon: "💬" },
                { title: "تذاكر الدعم", value: tickets.length, icon: "🎧" }
              ].map(item => (
                <div key={item.title} style={cardStyle}>
                  <div style={{ fontSize: "25px" }}>{item.icon}</div>
                  <p style={{ color: "#9aabc1" }}>{item.title}</p>
                  <h2 style={{ margin: 0 }}>{item.value}</h2>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h2>مرحباً بك في لوحة الإدارة</h2>
              <p style={{ color: "#aab8ca" }}>
                يمكنك إدارة منتجاتك ومتابعة محادثات وتذاكر الدعم من هنا.
              </p>
              <button onClick={() => setActivePage("المنتجات")} style={buttonStyle}>
                إدارة المنتجات
              </button>
            </div>
          </>
        )}

        {activePage === "المنتجات" && (
          <>
            <div style={{ ...cardStyle, marginBottom: "20px" }}>
              <h2>{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</h2>

              <form onSubmit={saveProduct}>
                <label>اسم المنتج</label>
                <input
                  style={inputStyle}
                  value={productForm.name}
                  onChange={e => updateProductField("name", e.target.value)}
                  required
                />

                <label>وصف المنتج</label>
                <textarea
                  style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
                  value={productForm.description}
                  onChange={e => updateProductField("description", e.target.value)}
                />

                <label>السعر</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={e => updateProductField("price", e.target.value)}
                  required
                />

                <label>رابط صورة المنتج</label>
                <input
                  style={inputStyle}
                  type="url"
                  value={productForm.image_url}
                  onChange={e => updateProductField("image_url", e.target.value)}
                />

                <label>رقم التصنيف (Category ID)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={productForm.category_id}
                  onChange={e => updateProductField("category_id", e.target.value)}
                />

                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  margin: "10px 0 20px"
                }}>
                  <input
                    type="checkbox"
                    checked={productForm.is_available}
                    onChange={e => updateProductField("is_available", e.target.checked)}
                  />
                  المنتج متاح للبيع
                </label>

                <button type="submit" disabled={loading} style={buttonStyle}>
                  {loading ? "جاري الحفظ..." : editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
                </button>

                {editingProduct && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{ ...buttonStyle, background: "#475569", marginRight: "10px" }}
                  >
                    إلغاء التعديل
                  </button>
                )}
              </form>
            </div>

            <div style={cardStyle}>
              <h2>منتجات المتجر ({products.length})</h2>
              <button onClick={loadProducts} style={buttonStyle}>تحديث المنتجات</button>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "15px",
                marginTop: "20px"
              }}>
                {products.map(product => (
                  <div key={product.id} style={{
                    background: "#080f1d",
                    border: "1px solid #263b5c",
                    borderRadius: "12px",
                    padding: "13px"
                  }}>
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{
                          width: "100%",
                          height: "160px",
                          objectFit: "contain",
                          background: "white",
                          borderRadius: "8px"
                        }}
                      />
                    )}
                    <h3>{product.name}</h3>
                    <p style={{ color: "#65a8ff" }}>السعر: {product.price}</p>
                    <p style={{ color: "#9aabc1" }}>{product.description}</p>
                    <p style={{ color: product.is_available ? "#65e6ad" : "#ff8888" }}>
                      {product.is_available ? "متاح للبيع" : "غير متاح"}
                    </p>
                    <button onClick={() => startEditProduct(product)} style={buttonStyle}>تعديل</button>
                    <button
                      onClick={() => deleteProduct(product)}
                      style={{ ...buttonStyle, background: "#a52b3c", marginRight: "7px" }}
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => toggleProductAvailability(product)}
                      style={{ ...buttonStyle, background: "#475569", marginTop: "7px", width: "100%" }}
                    >
                      {product.is_available ? "إخفاء المنتج" : "إظهار المنتج"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activePage === "المحادثات" && (
          <>
            <button onClick={loadConversations} style={{ ...buttonStyle, marginBottom: "18px" }}>
              تحديث المحادثات
            </button>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "18px"
            }}>
              <section style={cardStyle}>
                <h2>محادثات المنتجات</h2>
                {conversations.map(item => (
                  <button
                    key={item.id}
                    onClick={() => openConversation(item, "conversation")}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "right",
                      padding: "14px",
                      margin: "8px 0",
                      background: selected?.id === item.id && selectedType === "conversation" ? "#203b60" : "#182438",
                      color: "white",
                      border: "1px solid #263b5c",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    {item.customer_name}
                  </button>
                ))}
                {conversations.length === 0 && <p>لا توجد محادثات.</p>}
              </section>

              <section style={cardStyle}>
                <h2>{selected && selectedType === "conversation" ? `محادثة ${selected.customer_name}` : "اختر محادثة"}</h2>
                {selected && selectedType === "conversation" && (
                  <>
                    <div style={{
                      minHeight: "220px",
                      maxHeight: "400px",
                      overflowY: "auto",
                      background: "#080f1d",
                      padding: "12px",
                      borderRadius: "10px"
                    }}>
                      {messages.map(msg => (
                        <div key={msg.id} style={{
                          padding: "10px",
                          margin: "8px 0",
                          background: msg.sender_id === user.id ? "#123d70" : "#253247",
                          borderRadius: "8px"
                        }}>
                          <small>{msg.sender_id === user.id ? "الإدارة" : "الزبون"}</small>
                          <p>{msg.message}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => openConversation(selected, "conversation")} style={{ ...buttonStyle, margin: "12px 0" }}>
                      تحديث الرسائل
                    </button>
                    <form onSubmit={sendReply}>
                      <input
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        placeholder="اكتب ردك..."
                        required
                        style={inputStyle}
                      />
                      <button type="submit" disabled={loading} style={{ ...buttonStyle, width: "100%" }}>
                        إرسال الرد
                      </button>
                    </form>
                  </>
                )}
              </section>
            </div>
          </>
        )}

        {activePage === "تذاكر الدعم" && (
          <>
            <button
              onClick={loadTickets}
              style={{ ...buttonStyle, marginBottom: "18px" }}
            >
              تحديث التذاكر
            </button>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "18px"
            }}>
              <section style={cardStyle}>
                <h2>تذاكر الزبائن</h2>

                {tickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => openConversation(ticket, "ticket")}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "right",
                      padding: "14px",
                      margin: "8px 0",
                      background: selected?.id === ticket.id && selectedType === "ticket" ? "#203b60" : "#182438",
                      color: "white",
                      border: "1px solid #263b5c",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    <strong>{ticket.customer_name}</strong>
                    <br />
                    <small style={{ color: ticket.status === "open" ? "#65e6ad" : "#ff8888" }}>
                      {ticket.status === "open" ? "مفتوحة" : "مغلقة"}
                    </small>
                  </button>
                ))}

                {tickets.length === 0 && <p>لا توجد تذاكر دعم.</p>}
              </section>

              <section style={cardStyle}>
                <h2>
                  {selected && selectedType === "ticket"
                    ? `دعم ${selected.customer_name}`
                    : "اختر تذكرة"}
                </h2>

                {selected && selectedType === "ticket" && (
                  <>
                    <div style={{
                      minHeight: "220px",
                      maxHeight: "400px",
                      overflowY: "auto",
                      background: "#080f1d",
                      padding: "12px",
                      borderRadius: "10px"
                    }}>
                      {messages.map(msg => (
                        <div key={msg.id} style={{
                          padding: "10px",
                          margin: "8px 0",
                          background: msg.sender_id === user.id ? "#123d70" : "#253247",
                          borderRadius: "8px"
                        }}>
                          <small>{msg.sender_id === user.id ? "الإدارة" : "الزبون"}</small>
                          <p>{msg.message}</p>
                        </div>
                      ))}
                      {messages.length === 0 && <p>لا توجد رسائل بعد.</p>}
                    </div>

                    <button
                      onClick={() => openConversation(selected, "ticket")}
                      style={{ ...buttonStyle, margin: "12px 0" }}
                    >
                      تحديث الرسائل
                    </button>

                    {selected.status === "open" && (
                      <>
                        <form onSubmit={sendReply}>
                          <input
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            placeholder="اكتب ردك للزبون..."
                            required
                            style={inputStyle}
                          />
                          <button type="submit" disabled={loading} style={{ ...buttonStyle, width: "100%" }}>
                            إرسال الرد
                          </button>
                        </form>

                        <button
                          onClick={() => closeTicket(selected)}
                          style={{ ...buttonStyle, background: "#a52b3c", marginTop: "12px", width: "100%" }}
                        >
                          إغلاق التذكرة
                        </button>
                      </>
                    )}

                    {selected.status === "closed" && (
                      <p style={{ color: "#ff8888" }}>هذه التذكرة مغلقة.</p>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}

        {activePage === "الطلبات" && (
          <div style={cardStyle}>
            <h2>الطلبات</h2>
            <p>عدد الطلبات المسجلة: {ordersCount}</p>
            <button onClick={loadOrdersCount} style={buttonStyle}>تحديث عدد الطلبات</button>
          </div>
        )}

        {activePage === "الزبائن" && (
          <div style={cardStyle}>
            <h2>الزبائن</h2>
            <p>سنضيف قائمة الزبائن لاحقاً.</p>
          </div>
        )}

        {activePage === "الإعدادات" && (
          <div style={cardStyle}>
            <h2>إعدادات المتجر</h2>
            <p>سنضيف إعدادات المتجر لاحقاً.</p>
          </div>
        )}
      </main>
    </div>
  );
}