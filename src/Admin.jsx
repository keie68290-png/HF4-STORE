import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import "./App.css";

const emptyProduct = {
  name: "",
  description: "",
  price: "",
  image_url: "",
  category_id: "",
  is_available: true,
  discount_percent: 0
};

const defaultSettings = {
  store_name: "HF4 STORE",
  store_description: "متجرك المفضل للألعاب والحسابات",
  logo_url: "",
  discord_url: "https://discord.gg/HF4",
  contact_text: "",
  announcement_enabled: false,
  announcement_text: "",
  store_enabled: true,
  closed_message: "المتجر مغلق حالياً، يرجى العودة لاحقاً.",
  sections: {
    hero: true,
    features: true,
    products: true,
    offers: true,
    faq: true,
    about: true
  }
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

  const [settings, setSettings] = useState(defaultSettings);
  const [settingsLoading, setSettingsLoading] = useState(false);

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

  async function loadSettings() {
    const { data, error } = await supabase
      .from("store_settings")
      .select("settings")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      setError("تعذر تحميل إعدادات المتجر: " + error.message);
      return;
    }

    if (data?.settings) {
      setSettings({
        ...defaultSettings,
        ...data.settings,
        sections: {
          ...defaultSettings.sections,
          ...(data.settings.sections || {})
        }
      });
    }
  }

  function updateSetting(field, value) {
    setSettings(previous => ({
      ...previous,
      [field]: value
    }));
  }

  function updateSection(field, value) {
    setSettings(previous => ({
      ...previous,
      sections: {
        ...previous.sections,
        [field]: value
      }
    }));
  }

  async function saveSettings(e) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setSettingsLoading(true);

    try {
      const { error } = await supabase
        .from("store_settings")
        .upsert(
          {
            id: 1,
            settings,
            updated_at: new Date().toISOString()
          },
          { onConflict: "id" }
        );

      if (error) throw error;

      setSuccess("تم حفظ إعدادات المتجر بنجاح!");
    } catch (err) {
      setError("فشل حفظ الإعدادات: " + (err.message || "خطأ غير معروف"));
    } finally {
      setSettingsLoading(false);
    }
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
          loadOrdersCount(),
          loadSettings()
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
      is_available: product.is_available ?? true,
      discount_percent: product.discount_percent ?? 0
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

    const productName = String(productForm.name ?? "").trim();
    const categoryText = String(productForm.category_id ?? "").trim();
    const priceText = String(productForm.price ?? "").trim();

    if (!productName) {
      setError("اكتب اسم المنتج.");
      return;
    }

    if (
      priceText === "" ||
      !Number.isFinite(Number(priceText)) ||
      Number(priceText) < 0
    ) {
      setError("اكتب سعراً صحيحاً.");
      return;
    }

    const discount = Number(productForm.discount_percent);

    if (
      !Number.isInteger(discount) ||
      discount < 0 ||
      discount > 100
    ) {
      setError("نسبة الخصم يجب أن تكون رقماً صحيحاً بين 0 و100.");
      return;
    }

    const categoryId = categoryText === ""
      ? null
      : Number(categoryText);

    if (
      categoryId !== null &&
      (!Number.isInteger(categoryId) || categoryId <= 0)
    ) {
      setError("رقم التصنيف يجب أن يكون رقماً صحيحاً.");
      return;
    }

    const productData = {
      name: productName,
      description: String(productForm.description ?? "").trim(),
      price: Number(priceText),
      image_url: String(productForm.image_url ?? "").trim(),
      category_id: categoryId,
      is_available: productForm.is_available,
      discount_percent: discount
    };

    setLoading(true);

    try {
      if (editingProduct) {
        const { data, error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
          .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
          throw new Error(
            "لم يتم تعديل المنتج. تحقق من صلاحيات SELECT وUPDATE وسياسات RLS."
          );
        }

        setSuccess("تم تعديل المنتج بنجاح!");
      } else {
        const { error } = await supabase
          .from("products")
          .insert({
            ...productData,
            seller_id: user.id
          });

        if (error) throw error;

        setSuccess("تمت إضافة المنتج بنجاح!");
      }

      setEditingProduct(null);
      setProductForm(emptyProduct);

      await loadProducts();
    } catch (err) {
      setError("فشل حفظ المنتج: " + (err.message || "خطأ غير معروف"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`هل أنت متأكد من حذف المنتج "${product.name}"؟`)) {
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("لم يتم حذف المنتج. تحقق من صلاحيات الحذف وسياسات RLS.");
      }

      if (editingProduct?.id === product.id) {
        setEditingProduct(null);
        setProductForm(emptyProduct);
      }

      setProducts(previous =>
        previous.filter(item => item.id !== product.id)
      );

      setSuccess("تم حذف المنتج بنجاح.");
    } catch (err) {
      setError("فشل حذف المنتج: " + (err.message || "خطأ غير معروف"));
    } finally {
      setLoading(false);
    }
  }

  async function toggleProductAvailability(product) {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .update({ is_available: !product.is_available })
        .eq("id", product.id)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("لم يتم تحديث حالة المنتج. تحقق من الصلاحيات.");
      }

      setSuccess("تم تحديث حالة المنتج بنجاح.");
      await loadProducts();
    } catch (err) {
      setError("فشل تحديث حالة المنتج: " + (err.message || "خطأ غير معروف"));
    } finally {
      setLoading(false);
    }
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

    setLoading(true);
    setError("");

    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .eq("id", ticket.id);

      if (error) throw error;

      setSuccess("تم إغلاق التذكرة.");
      await loadTickets();

      if (selected?.id === ticket.id && selectedType === "ticket") {
        setSelected({ ...ticket, status: "closed" });
      }
    } catch (err) {
      setError(err.message || "تعذر إغلاق التذكرة.");
    } finally {
      setLoading(false);
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

                <label style={{ color: "#168cff", fontWeight: "bold" }}>
                  🔥 نسبة الخصم (%)
                </label>
                <input
                  style={{
                    ...inputStyle,
                    border: "1px solid #168cff"
                  }}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={productForm.discount_percent}
                  onChange={e => updateProductField("discount_percent", e.target.value)}
                  placeholder="مثلاً 20"
                />
                <small style={{
                  display: "block",
                  color: "#9aabc1",
                  marginTop: "-10px",
                  marginBottom: "15px"
                }}>
                  اكتب 20 لخصم 20%، أو 0 لإلغاء العرض.
                </small>

                {Number(productForm.discount_percent) > 0 &&
                  Number(productForm.price) >= 0 && (
                    <div style={{
                      background: "#102b4b",
                      border: "1px solid #168cff",
                      padding: "12px",
                      borderRadius: "8px",
                      marginBottom: "15px"
                    }}>
                      <strong style={{ color: "#168cff" }}>
                        معاينة العرض:
                      </strong>
                      <p style={{ marginBottom: 0 }}>
                        السعر الأصلي: ${Number(productForm.price || 0).toFixed(2)}
                      </p>
                      <p style={{ color: "#65e6ad", marginBottom: 0 }}>
                        السعر بعد الخصم: $
                        {(Number(productForm.price || 0) *
                          (1 - Number(productForm.discount_percent) / 100)).toFixed(2)}
                      </p>
                    </div>
                  )}

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

                <button type="submit" disabled={loading} style={{
                  ...buttonStyle,
                  opacity: loading ? 0.6 : 1
                }}>
                  {loading ? "جاري الحفظ..." : editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
                </button>

                {editingProduct && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={loading}
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

                    {Number(product.discount_percent) > 0 ? (
                      <div style={{
                        background: "#102b4b",
                        border: "1px solid #168cff",
                        borderRadius: "8px",
                        padding: "10px",
                        margin: "10px 0"
                      }}>
                        <strong style={{ color: "#168cff" }}>
                          🔥 عرض {product.discount_percent}%
                        </strong>
                        <p style={{ color: "#999", margin: "7px 0" }}>
                          <del>${Number(product.price).toFixed(2)}</del>
                        </p>
                        <strong style={{ color: "#65e6ad" }}>
                          $
                          {(Number(product.price) *
                            (1 - Number(product.discount_percent) / 100)).toFixed(2)}
                        </strong>
                      </div>
                    ) : (
                      <p style={{ color: "#65a8ff" }}>
                        السعر: ${Number(product.price).toFixed(2)}
                      </p>
                    )}

                    <p style={{ color: "#9aabc1" }}>{product.description}</p>

                    <p style={{ color: product.is_available ? "#65e6ad" : "#ff8888" }}>
                      {product.is_available ? "متاح للبيع" : "غير متاح"}
                    </p>

                    <button
                      onClick={() => startEditProduct(product)}
                      disabled={loading}
                      style={buttonStyle}
                    >
                      تعديل
                    </button>

                    <button
                      onClick={() => deleteProduct(product)}
                      disabled={loading}
                      style={{
                        ...buttonStyle,
                        background: "#a52b3c",
                        marginRight: "7px",
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      حذف
                    </button>

                    <button
                      onClick={() => toggleProductAvailability(product)}
                      disabled={loading}
                      style={{
                        ...buttonStyle,
                        background: "#475569",
                        marginTop: "7px",
                        width: "100%"
                      }}
                    >
                      {product.is_available ? "إخفاء المنتج" : "إظهار المنتج"}
                    </button>
                  </div>
                ))}

                {products.length === 0 && (
                  <p style={{ color: "#9aabc1" }}>لا توجد منتجات حالياً.</p>
                )}
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
                <h2>
                  {selected && selectedType === "conversation"
                    ? `محادثة ${selected.customer_name}`
                    : "اختر محادثة"}
                </h2>

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

                    <button
                      onClick={() => openConversation(selected, "conversation")}
                      style={{ ...buttonStyle, margin: "12px 0" }}
                    >
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
                          disabled={loading}
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
            <button onClick={loadOrdersCount} style={buttonStyle}>
              تحديث عدد الطلبات
            </button>
          </div>
        )}

        {activePage === "الزبائن" && (
          <div style={cardStyle}>
            <h2>الزبائن</h2>
            <p>سنضيف قائمة الزبائن لاحقاً.</p>
          </div>
        )}

        {activePage === "الإعدادات" && (
          <form onSubmit={saveSettings}>
            <div style={{ ...cardStyle, marginBottom: "18px" }}>
              <h2>⚙️ إعدادات المتجر العامة</h2>
              <p style={{ color: "#9aabc1" }}>
                غيّر معلومات المتجر التي تريد استخدامها في واجهة الموقع.
              </p>

              <label>اسم المتجر</label>
              <input
                style={inputStyle}
                value={settings.store_name}
                onChange={e => updateSetting("store_name", e.target.value)}
                placeholder="HF4 STORE"
              />

              <label>وصف المتجر</label>
              <textarea
                style={{ ...inputStyle, minHeight: "80px" }}
                value={settings.store_description}
                onChange={e => updateSetting("store_description", e.target.value)}
                placeholder="اكتب وصف المتجر..."
              />

              <label>رابط شعار المتجر</label>
              <input
                style={inputStyle}
                type="url"
                value={settings.logo_url}
                onChange={e => updateSetting("logo_url", e.target.value)}
                placeholder="https://example.com/logo.png"
              />

              <label>رابط Discord</label>
              <input
                style={inputStyle}
                type="url"
                value={settings.discord_url}
                onChange={e => updateSetting("discord_url", e.target.value)}
                placeholder="https://discord.gg/..."
              />

              <label>معلومات التواصل</label>
              <input
                style={inputStyle}
                value={settings.contact_text}
                onChange={e => updateSetting("contact_text", e.target.value)}
                placeholder="اكتب معلومات التواصل..."
              />
            </div>

            <div style={{ ...cardStyle, marginBottom: "18px" }}>
              <h2>📢 إعلان أعلى الموقع</h2>

              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                margin: "15px 0"
              }}>
                <input
                  type="checkbox"
                  checked={settings.announcement_enabled}
                  onChange={e => updateSetting("announcement_enabled", e.target.checked)}
                />
                تفعيل الإعلان
              </label>

              <label>نص الإعلان</label>
              <textarea
                style={{ ...inputStyle, minHeight: "80px" }}
                value={settings.announcement_text}
                onChange={e => updateSetting("announcement_text", e.target.value)}
                placeholder="اكتب الإعلان الذي سيظهر للزوار..."
              />
            </div>

            <div style={{ ...cardStyle, marginBottom: "18px" }}>
              <h2>🛍️ حالة المتجر</h2>

              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                margin: "15px 0"
              }}>
                <input
                  type="checkbox"
                  checked={settings.store_enabled}
                  onChange={e => updateSetting("store_enabled", e.target.checked)}
                />
                المتجر مفتوح ويستقبل الزبائن
              </label>

              <label>الرسالة التي تظهر عند إغلاق المتجر</label>
              <textarea
                style={{ ...inputStyle, minHeight: "80px" }}
                value={settings.closed_message}
                onChange={e => updateSetting("closed_message", e.target.value)}
                placeholder="المتجر مغلق حالياً..."
              />
            </div>

            <div style={{ ...cardStyle, marginBottom: "18px" }}>
              <h2>👁️ إظهار وإخفاء أقسام الموقع</h2>
              <p style={{ color: "#9aabc1" }}>
                هذه الخيارات تحفظ حالة الأقسام في قاعدة البيانات.
              </p>

              {[
                ["hero", "القسم الرئيسي"],
                ["features", "قسم المميزات"],
                ["products", "قسم المنتجات"],
                ["offers", "قسم العروض"],
                ["faq", "الأسئلة الشائعة"],
                ["about", "من نحن"]
              ].map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px",
                    margin: "7px 0",
                    background: "#080f1d",
                    borderRadius: "8px"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.sections[key]}
                    onChange={e => updateSection(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={settingsLoading}
              style={{
                ...buttonStyle,
                width: "100%",
                padding: "16px",
                fontSize: "17px",
                opacity: settingsLoading ? 0.6 : 1
              }}
            >
              {settingsLoading ? "جاري حفظ الإعدادات..." : "💾 حفظ جميع الإعدادات"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}