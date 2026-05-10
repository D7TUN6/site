import type { Lang } from '@/types/content'

export type UiCopy = {
  account: string
  cart: string
  light: string
  dark: string
  themeToggle: string
  musicBack: string
  newsBack: string
  blogBack: string
  shopBack: string
  shopAddToCart: string
  shopToCart: string
  shopEmpty: string
  cartEmpty: string
  cartClear: string
  cartTotal: string
  authLogin: string
  authRegister: string
  authLogout: string
  authSignInHint: string
  authGoToAccount: string
  adminTitle: string
  adminLoginRequired: string
  adminGoToAccount: string
  mainPageBack: string
  shopTitle: string
  accountTitle: string
  login: string
  register: string
}

const copy: Record<Lang, UiCopy> = {
  en: {
    account: 'ACCOUNT',
    cart: 'CART',
    light: 'LIGHT',
    dark: 'DARK',
    themeToggle: 'toggle theme',
    musicBack: 'BACK TO DISCOGRAPHY',
    newsBack: 'BACK TO NEWS',
    blogBack: 'BACK TO BLOG',
    shopBack: 'BACK TO SHOP',
    shopAddToCart: 'add to cart',
    shopToCart: 'cart',
    shopEmpty: 'No results.',
    cartEmpty: 'Your cart is empty.',
    cartClear: 'clear',
    cartTotal: 'total',
    authLogin: 'login',
    authRegister: 'register',
    authLogout: 'logout',
    authSignInHint: 'sign in or register',
    authGoToAccount: 'go to account',
    adminTitle: 'admin',
    adminLoginRequired: 'admin login is required',
    adminGoToAccount: 'go to account',
    mainPageBack: 'BACK TO DISCOGRAPHY',
    shopTitle: 'shop',
    accountTitle: 'account',
    login: 'login',
    register: 'register',
  },
  ru: {
    account: 'КАБИНЕТ',
    cart: 'КОРЗИНА',
    light: 'СВЕТ',
    dark: 'ТЬМА',
    themeToggle: 'переключить тему',
    musicBack: 'НАЗАД К ДИСКОГРАФИИ',
    newsBack: 'НАЗАД К НОВОСТЯМ',
    blogBack: 'НАЗАД К БЛОГУ',
    shopBack: 'НАЗАД В МАГАЗИН',
    shopAddToCart: 'в корзину',
    shopToCart: 'корзина',
    shopEmpty: 'Ничего не найдено.',
    cartEmpty: 'Корзина пустая.',
    cartClear: 'очистить',
    cartTotal: 'итого',
    authLogin: 'вход',
    authRegister: 'регистрация',
    authLogout: 'выйти',
    authSignInHint: 'войдите или зарегистрируйтесь',
    authGoToAccount: 'перейти',
    adminTitle: 'админка',
    adminLoginRequired: 'нужен admin вход через кабинет',
    adminGoToAccount: 'перейти в кабинет',
    mainPageBack: 'НАЗАД К ДИСКОГРАФИИ',
    shopTitle: 'магазин',
    accountTitle: 'личный кабинет',
    login: 'вход',
    register: 'регистрация',
  },
}

export function getUiCopy(lang: Lang): UiCopy {
  return copy[lang]
}
