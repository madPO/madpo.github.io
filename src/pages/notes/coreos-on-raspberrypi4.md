---
layout: ../../layouts/NoteLayout.astro
title: Установка CoreOS на Raspberrypi 4
---

# Как установить CoreOS на Raspberry pi 4
     
А вот сейчас расскажу как. 

## Подготовка

Для начала я собрал набор для raspberry pi:   
- Raspberry Pi4 model B
- SSD + адаптер usb A к sata
- micro sd (в комплекте шел удобный переходник usb A к micro sd)
- питание + сетевой кабель
     
Флешку нужно было отформатировать, чтобы она корректно воспринималась raspberry pi. Это можно сделать через Raspberry Pi Imager. Только вместо операционной системы выбираем - "отформатировать карту". Если на флешке уже были разделы, то удаляем их, а потом форматируем. 
    
У проекта CoreOS есть [документация для установки ОС](https://docs.fedoraproject.org/en-US/fedora-coreos/provisioning-raspberry-pi4/) на raspberry pi. Чтобы ее выполнить мне нужна Fedora Linux, но у меня только windows. К счастью, есть wsl и возможность [развернуть там образ Fedora](https://docs.fedoraproject.org/en-US/cloud/wsl/). 
     
```shell 
wsl --install
wsl --install FedoraLinux-43
wsl -d FedoraLinux-43
```

В самой Fedora установил необходимые пакеты:
```shell
dnf install -y butane coreos-installer ignition-validate jq cpio
```

## Конфигурация

CoreOS позволяет предварительно сконфигурировать систему. Т.к. я еще не был уверен, что мне понадобится и как это все работает, я собрал минимальный конфиг. Стандартное расширение для него - `bu`, но для удобства редактирования его можно сохранить, как `example.yml`. 
```yml
variant: fcos
version: 1.6.0
passwd:
    groups:
        - name: admin
    users:
        - name: admin
          password_hash: ...
          groups:
            - admin
            - wheel
            - sudo
            - docker
        - name: workers
          groups: 
            - docker  
            - wheel
storage:
    files:
        - path: /etc/hostname
          mode: 0644
          overwrite: true
          contents:
            inline: homeserver
        - path: /etc/ssh/sshd_config.d/20-enable-passwords.conf
          mode: 0644
          contents:
              inline: |
                  # Fedora CoreOS disables SSH password login by default.
                  # Enable it.
                  # This file must sort before 40-disable-passwords.conf.
                  PasswordAuthentication yes
    links:
        - path: /etc/localtime
          target: ../usr/share/zoneinfo/Europe/Moscow        

```

Дальше конфиг нужно преобразовать в ignition формат. Формально, там будет почти тоже самое, только в json. На этом этапе с конфигурацией все, если нужно будет внести изменения, то трансформацию придется повторить.
```shell
butane --pretty --strict example.yml --output example.ign
ignition-validate example.ign && echo 'Success!'
```

## Запись образа на micro sd
Сначала подготовим дополнительные файлы для загрузки CoreOS в raspberry pi. 
```shell
mkdir -p /tmp/RPi4boot/boot/efi/
dnf download --resolve --releasever=43 --forcearch=aarch64 --destdir=/tmp/RPi4boot/ uboot-images-armv8 bcm283x-firmware bcm283x-overlays
for rpm in /tmp/RPi4boot/*rpm; do rpm2cpio $rpm | cpio -idv -D /tmp/RPi4boot/; done
mv /tmp/RPi4boot/usr/share/uboot/rpi_arm64/u-boot.bin /tmp/RPi4boot/boot/efi/rpi-u-boot.bin
```

Дальше меня ждала неожиданность - wsl не умеет пробрасывать usb устройства. Эту проблему можно решить с [помощью USBIPD-WIN](https://learn.microsoft.com/en-us/windows/wsl/connect-usb). Эта утилита устанавливается на windows хост. Затем в хосте нужно будет открыть консоль, найти нужное устройство и подключить его в wsl.
```shell
usbipd list
usbipd bind --busid 7-1
usbipd attach --wsl --busid FedoraLinux-43
```

Возвращаемся в Fedora и загружаем CoreOS на micro usb. Первая команда выведет список дисков, там будет и флешка
```shell
fdisk -l
coreos-installer install -a aarch64 -s stable -i example.ign /dev/sde
FCOSEFIPARTITION=$(lsblk /dev/sde -J -oLABEL,PATH |
                   jq -r '.blockdevices[] | select(.label == "EFI-SYSTEM") | .path')
mkdir /tmp/FCOSEFIpart
sudo mount $FCOSEFIPARTITION /tmp/FCOSEFIpart
sudo rsync -avh --ignore-existing --chown 0:0 \
        /tmp/RPi4boot/boot/efi/ /tmp/FCOSEFIpart/
sudo umount $FCOSEFIPARTITION
```

Перед извлечением флешки я на всякий случай отключал ее от wsl. Но даже так оставалась какая-то магия, из-за которой первая попытка была провальной.
```shell
usbipd detach --busid 7-1
```

## Запуск
Теперь флешку можно вставить в raspberry pi и запустить. Если все прошло успешно, то CoreOS проинициализируется и предложит авторизоваться под пользователем. Сам процесс занимает какое-то время, я следил за ним, подключив raspberry pi к монитору. Сразу после запуска будет доступен ssh. Затем я подключился и смонтировал диск.
```shell
fdisk -l
fdisk /dev/sda
: n
: p
: 1
: enter
: enter
: w
mkfs -t ext4 /dev/sda1
mkdir /mnt/share
mount -t ext4 /dev/sda1 /mnt/share
vi  /etc/fstab
> /dev/sda1 /mnt/share ext4 defaults 0 0
```